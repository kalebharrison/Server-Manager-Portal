import { randomUUID } from 'crypto';
import {
    MAINTENANCE_DEFAULTS,
    MAINTENANCE_PREFS_DEFAULTS,
    MAINTENANCE_FILTER_CATALOG,
    isMaintenanceExperimentalEnabled,
    applyMaintenanceExclusions,
    getMaintenanceSettings,
    computeRuleGraceRemainingDays,
    resolveMaintenanceMaxActions,
    sanitizeMaintenanceRuleForPersist,
    evaluateMaintenanceRule,
} from './maintenance-rule-engine.js';
import { createMaintenanceIndexService } from './maintenance-index-service.js';

export const createMaintenanceService = ({
    configPath,
    maintenancePrefsPath,
    maintenanceMediaIndexPath,
    maintenanceRequestIndexPath,
    analyticsHistoryCachePath = null,
    maintenanceRulesPath,
    maintenanceRunsPath,
    loadFile,
    saveFile,
    getPlexConnectionUri,
    resolveIntegrationUrlForFetch,
    appendAuditLog,
    markTaskStart,
    markTaskEnd,
    systemJobs,
    runHeavyJob,
    log,
}) => {
    const maintenanceRunState = { running: false, lastRunAt: null, lastError: null };
    const loadMaintenancePreferences = async () => {
        const raw = await loadFile(maintenancePrefsPath, MAINTENANCE_PREFS_DEFAULTS);
        return {
            global: {
                ...MAINTENANCE_PREFS_DEFAULTS.global,
                ...(raw?.global || {})
            },
            exclusions: {
                ratingKeys: Array.isArray(raw?.exclusions?.ratingKeys) ? raw.exclusions.ratingKeys.map(v => String(v)) : [],
                titles: Array.isArray(raw?.exclusions?.titles) ? raw.exclusions.titles.map(v => String(v)) : [],
                libraries: Array.isArray(raw?.exclusions?.libraries) ? raw.exclusions.libraries.map(v => String(v)) : []
            }
        };
    };

    const { buildMaintenanceMediaIndex } = createMaintenanceIndexService({
        configPath,
        maintenanceMediaIndexPath,
        maintenanceRequestIndexPath,
        analyticsHistoryCachePath,
        loadFile,
        saveFile,
        getPlexConnectionUri,
        resolveIntegrationUrlForFetch,
        appendAuditLog,
        markTaskStart,
        markTaskEnd,
        systemJobs,
        runHeavyJob,
        log,
    });

    const validateMaintenanceDestructivePreflight = async (config, rule, catalog) => {
        const errors = [];
        const warnings = [];
        const indexPayload = await loadFile(maintenanceMediaIndexPath, { items: [], generatedAt: null });
        if (!indexPayload.generatedAt || !Array.isArray(indexPayload.items) || indexPayload.items.length === 0) {
            errors.push('Maintenance media index is empty. Rebuild the index before running destructive actions.');
        }
        const wantsDelete = rule?.actions?.deleteFromArr !== false;
        const wantsUnmonitor = !!rule?.actions?.unmonitor;
        const wantsQuality = Number(rule?.actions?.qualityProfileId || 0) > 0;
        if (wantsDelete || wantsUnmonitor || wantsQuality) {
            const radarrReady = !!(config.radarrUrl && config.radarrApiKey);
            const sonarrReady = !!(config.sonarrUrl && config.sonarrApiKey);
            if (wantsDelete) {
                if (!radarrReady) warnings.push('Radarr is not configured — matched movies cannot be deleted.');
                if (!sonarrReady) warnings.push('Sonarr is not configured — matched shows cannot be deleted.');
                if (!radarrReady && !sonarrReady) {
                    errors.push('Neither Radarr nor Sonarr is configured. Configure at least one integration before destructive delete.');
                }
            }
            if ((wantsDelete || wantsUnmonitor || wantsQuality) && radarrReady && catalog.radarr.length === 0) {
                warnings.push('Radarr catalog is empty or unreachable — movie matches may be unactionable.');
            }
            if ((wantsDelete || wantsUnmonitor || wantsQuality) && sonarrReady && catalog.sonarr.length === 0) {
                warnings.push('Sonarr catalog is empty or unreachable — show matches may be unactionable.');
            }
        }
        return { ok: errors.length === 0, errors, warnings };
    };

    const buildMaintenancePreviewForRule = (rule, allItems, preferences, catalog = null, options = {}) => {
        const { limit = 300, includeAll = false } = options;
        const matches = applyMaintenanceExclusions(allItems.filter(item => evaluateMaintenanceRule(item, rule)), preferences);
        const graceRemainingDays = computeRuleGraceRemainingDays(rule);
        const maxActions = resolveMaintenanceMaxActions(rule, preferences);
        let actionableCount = 0;
        let unactionableCount = 0;

        if (catalog && graceRemainingDays <= 0) {
            for (const item of matches) {
                const resolved = resolveArrEntity(item, catalog);
                if (resolved.entity) actionableCount += 1;
                else unactionableCount += 1;
            }
        }

        const sampleSource = includeAll ? matches : matches.slice(0, Math.max(1, Number(limit)));
        const sample = sampleSource.map((item) => {
            const resolved = catalog ? resolveArrEntity(item, catalog) : { type: 'none', entity: null };
            return {
                ...item,
                graceRemainingDays,
                eligible: graceRemainingDays <= 0,
                arrResolvable: !!resolved.entity,
                arrType: resolved.type
            };
        });

        const eligibleCount = graceRemainingDays <= 0 ? matches.length : 0;
        return {
            ruleId: rule.id,
            ruleName: rule.name,
            totalMatches: matches.length,
            graceRemainingDays,
            inGraceCount: graceRemainingDays > 0 ? matches.length : 0,
            eligibleCount,
            actionableCount,
            unactionableCount,
            maxActionsPerRun: maxActions,
            wouldProcessCount: Math.min(maxActions, eligibleCount),
            sample
        };
    };

    let cachedArrCatalog = null;
    let cachedArrCatalogAt = 0;
    const ARR_CATALOG_CACHE_MS = 5 * 60 * 1000;

    const buildArrLookupMaps = (radarrItems = [], sonarrItems = []) => {
        const addEntry = (maps, entry) => {
            const imdb = entry?.imdbId ? String(entry.imdbId) : null;
            const tmdb = entry?.tmdbId != null ? String(entry.tmdbId) : null;
            const tvdb = entry?.tvdbId != null ? String(entry.tvdbId) : null;
            if (imdb) maps.byImdb.set(imdb, entry);
            if (tmdb) maps.byTmdb.set(tmdb, entry);
            if (tvdb) maps.byTvdb.set(tvdb, entry);
        };
        const radarrMaps = { byImdb: new Map(), byTmdb: new Map(), byTvdb: new Map() };
        const sonarrMaps = { byImdb: new Map(), byTmdb: new Map(), byTvdb: new Map() };
        radarrItems.forEach((entry) => addEntry(radarrMaps, entry));
        sonarrItems.forEach((entry) => addEntry(sonarrMaps, entry));
        return { radarr: radarrMaps, sonarr: sonarrMaps };
    };

    const getArrCatalog = async (config, { force = false } = {}) => {
        if (!force && cachedArrCatalog && (Date.now() - cachedArrCatalogAt) < ARR_CATALOG_CACHE_MS) {
            return cachedArrCatalog;
        }
        const [radarrItems, sonarrItems] = await Promise.all([
            config.radarrUrl && config.radarrApiKey
                ? fetch(`${resolveIntegrationUrlForFetch(config.radarrUrl)}/api/v3/movie`, { headers: { 'X-Api-Key': config.radarrApiKey, Accept: 'application/json' } }).then(r => r.json()).catch(() => [])
                : [],
            config.sonarrUrl && config.sonarrApiKey
                ? fetch(`${resolveIntegrationUrlForFetch(config.sonarrUrl)}/api/v3/series`, { headers: { 'X-Api-Key': config.sonarrApiKey, Accept: 'application/json' } }).then(r => r.json()).catch(() => [])
                : []
        ]);

        const radarr = Array.isArray(radarrItems) ? radarrItems : [];
        const sonarr = Array.isArray(sonarrItems) ? sonarrItems : [];
        cachedArrCatalog = {
            radarr,
            sonarr,
            lookup: buildArrLookupMaps(radarr, sonarr)
        };
        cachedArrCatalogAt = Date.now();
        return cachedArrCatalog;
    };

    const invalidateArrCatalogCache = () => {
        cachedArrCatalog = null;
        cachedArrCatalogAt = 0;
    };

    const resolveArrEntity = (item, catalog) => {
        const lookup = catalog?.lookup;
        if (lookup) {
            const maps = item.mediaType === 'movie' ? lookup.radarr : lookup.sonarr;
            const arrType = item.mediaType === 'movie' ? 'radarr' : 'sonarr';
            const entity = (item.imdbId && maps.byImdb.get(String(item.imdbId)))
                || (item.tmdbId && maps.byTmdb.get(String(item.tmdbId)))
                || (item.tvdbId && maps.byTvdb.get(String(item.tvdbId)))
                || null;
            if (entity) return { type: arrType, entity };
            return { type: 'none', entity: null };
        }

        const matchByIds = (entry) => {
            const imdb = entry?.imdbId || null;
            const tmdb = entry?.tmdbId ? String(entry.tmdbId) : null;
            const tvdb = entry?.tvdbId ? String(entry.tvdbId) : null;
            return (item.imdbId && imdb && item.imdbId === imdb)
                || (item.tmdbId && tmdb && item.tmdbId === tmdb)
                || (item.tvdbId && tvdb && item.tvdbId === tvdb);
        };

        if (item.mediaType === 'movie') {
            const radarrMatch = catalog.radarr.find(matchByIds);
            if (radarrMatch) return { type: 'radarr', entity: radarrMatch };
        } else {
            const sonarrMatch = catalog.sonarr.find(matchByIds);
            if (sonarrMatch) return { type: 'sonarr', entity: sonarrMatch };
        }
        return { type: 'none', entity: null };
    };

    const applyArrActions = async (config, resolved, actions = {}) => {
        if (!resolved?.entity || !resolved?.type || resolved.type === 'none') {
            return { success: false, reason: 'No Sonarr/Radarr mapping found' };
        }
        const deleteFiles = actions.deleteFiles !== false;
        const shouldDelete = actions.deleteFromArr !== false;
        const shouldUnmonitor = !!actions.unmonitor;
        const qualityProfileId = Number(actions.qualityProfileId || 0);

        const baseUrl = resolved.type === 'radarr' ? resolveIntegrationUrlForFetch(config.radarrUrl) : resolveIntegrationUrlForFetch(config.sonarrUrl);
        const apiKey = resolved.type === 'radarr' ? config.radarrApiKey : config.sonarrApiKey;
        const headers = { 'X-Api-Key': apiKey, Accept: 'application/json', 'Content-Type': 'application/json' };
        const id = resolved.entity.id;

        if (qualityProfileId > 0) {
            const putRes = await fetch(`${baseUrl}/api/v3/${resolved.type === 'radarr' ? 'movie' : 'series'}/${id}`, { method: 'PUT', headers, body: JSON.stringify({ ...resolved.entity, qualityProfileId }) });
            if (!putRes.ok) return { success: false, reason: `ARR quality profile update failed (${putRes.status})` };
        }
        if (shouldUnmonitor) {
            const putRes = await fetch(`${baseUrl}/api/v3/${resolved.type === 'radarr' ? 'movie' : 'series'}/${id}`, { method: 'PUT', headers, body: JSON.stringify({ ...resolved.entity, monitored: false }) });
            if (!putRes.ok) return { success: false, reason: `ARR unmonitor failed (${putRes.status})` };
        }
        if (shouldDelete) {
            const deletePath = resolved.type === 'radarr'
                ? `/api/v3/movie/${id}?deleteFiles=${deleteFiles ? 'true' : 'false'}&addImportExclusion=false`
                : `/api/v3/series/${id}?deleteFiles=${deleteFiles ? 'true' : 'false'}&addImportListExclusion=false`;
            const delRes = await fetch(`${baseUrl}${deletePath}`, { method: 'DELETE', headers });
            if (!delRes.ok && delRes.status !== 404) {
                return { success: false, reason: `ARR delete failed (${delRes.status})` };
            }
        }
        return { success: true };
    };

    const resolveCollectionRatingKey = async (config, uri, libraryId, title) => {
        try {
            const payload = await fetch(`${uri}/library/sections/${encodeURIComponent(libraryId)}/collections?X-Plex-Token=${encodeURIComponent(config.plexToken)}`, {
                headers: { Accept: 'application/json' }
            }).then(r => r.json()).catch(() => null);
            const collections = Array.isArray(payload?.MediaContainer?.Metadata) ? payload.MediaContainer.Metadata : [];
            const needle = String(title || '').trim().toLowerCase();
            const exact = collections.find((c) => String(c?.title || '').trim().toLowerCase() === needle);
            const candidate = exact || collections.find((c) => String(c?.title || '').toLowerCase().includes(needle));
            return candidate?.ratingKey ? String(candidate.ratingKey) : null;
        } catch (e) {
            return null;
        }
    };

    const pinCollectionToHome = async (config, uri, libraryId, collectionRatingKey, pinToHomeForAllUsers) => {
        if (!pinToHomeForAllUsers || !libraryId || !collectionRatingKey) return { pinned: false };
        try {
            const hubManageUrl = `${uri}/hubs/sections/${encodeURIComponent(libraryId)}/manage?metadataItemId=${encodeURIComponent(collectionRatingKey)}&promotedToRecommended=1&promotedToOwnHome=1&promotedToSharedHome=1&X-Plex-Token=${encodeURIComponent(config.plexToken)}`;
            const res = await fetch(hubManageUrl, { method: 'PUT', headers: { Accept: 'application/json' } }).catch(() => null);
            return { pinned: !!(res && res.ok), status: res?.status || null };
        } catch (e) {
            return { pinned: false, error: e.message };
        }
    };

    const syncRulePlexCollection = async (config, uri, rule, items, options = {}) => {
        const collectionSettings = rule?.collection || {};
        if (!collectionSettings.enabled || !items.length) return { success: true, updated: false };
        const pinToHomeForAllUsers = !!options.pinToHomeForAllUsers;

        const sectionGroups = new Map();
        items.forEach((item) => {
            if (!item.libraryId || !item.ratingKey) return;
            const key = `${item.libraryId}:${item.mediaType === 'movie' ? 1 : 2}`;
            if (!sectionGroups.has(key)) sectionGroups.set(key, []);
            sectionGroups.get(key).push(item.ratingKey);
        });

        let updated = 0;
        let pinned = 0;
        for (const [sectionKey, ratingKeys] of sectionGroups.entries()) {
            const [libraryId, typeId] = sectionKey.split(':');
            const nameTemplate = collectionSettings.nameTemplate || 'Maintenance - {{ruleName}}';
            const title = String(nameTemplate).replace('{{ruleName}}', rule.name || 'Rule').replace('{{date}}', new Date().toISOString().split('T')[0]);
            const uniqueKeys = [...new Set(ratingKeys)].slice(0, 500);
            if (!uniqueKeys.length) continue;
            const sourceUri = `server://${config.serverIdentifier}/com.plexapp.plugins.library/library/metadata/${uniqueKeys.join(',')}`;
            const targetUrl = `${uri}/library/collections?title=${encodeURIComponent(title)}&type=${typeId}&smart=0&sectionId=${encodeURIComponent(libraryId)}&uri=${encodeURIComponent(sourceUri)}&X-Plex-Token=${encodeURIComponent(config.plexToken)}`;
            const createRes = await fetch(targetUrl, { method: 'POST', headers: { Accept: 'application/json' } }).catch(() => null);
            if (createRes && (createRes.ok || createRes.status === 201 || createRes.status === 200)) {
                updated += 1;
                if (pinToHomeForAllUsers) {
                    const collectionRatingKey = await resolveCollectionRatingKey(config, uri, libraryId, title);
                    const pinResult = await pinCollectionToHome(config, uri, libraryId, collectionRatingKey, true);
                    if (pinResult.pinned) pinned += 1;
                }
            }
        }
        return { success: true, updated: updated > 0, updatedCollections: updated, pinRequested: pinToHomeForAllUsers, pinnedCollections: pinned };
    };

    const createRunRecord = (rule, dryRun, actor) => ({
        id: randomUUID(),
        ruleId: rule.id,
        ruleName: rule.name || 'Unnamed Rule',
        dryRun,
        startedAt: new Date().toISOString(),
        completedAt: null,
        status: 'running',
        actor: actor ? { id: actor.id || null, username: actor.username || null, email: actor.email || null } : null,
        totals: { matched: 0, processed: 0, deleted: 0, skipped: 0, failed: 0 },
        outcomes: [],
        errors: []
    });

    const runMaintenanceRule = async ({ rule, dryRun, actor, confirmToken, runOptions = {} }) => {
        const config = await loadFile(configPath, {});
        const indexPayload = await loadFile(maintenanceMediaIndexPath, { items: [] });
        const preferences = await loadMaintenancePreferences();
        const items = Array.isArray(indexPayload.items) ? indexPayload.items : [];
        const settings = getMaintenanceSettings(rule);
        const effectiveDryRun = dryRun !== undefined && dryRun !== null
            ? !!dryRun
            : (settings.dryRunByDefault ?? preferences.global?.dryRunByDefault ?? MAINTENANCE_DEFAULTS.dryRunByDefault);
        const destructive = !effectiveDryRun && (rule?.actions?.deleteFromArr !== false || !!rule?.actions?.unmonitor || Number(rule?.actions?.qualityProfileId || 0) > 0);
        const confirmRequired = settings.requireConfirmForDestructive ?? preferences.global?.requireConfirmForDestructive ?? MAINTENANCE_DEFAULTS.requireConfirmForDestructive;
        if (destructive && confirmRequired && String(confirmToken || '') !== 'CONFIRM_MAINTENANCE_DELETE') {
            throw new Error('Destructive run requires confirm token.');
        }

        const matched = applyMaintenanceExclusions(items.filter(item => evaluateMaintenanceRule(item, rule)), preferences);
        const run = createRunRecord(rule, effectiveDryRun, actor);
        run.totals.matched = matched.length;

        const maxActions = resolveMaintenanceMaxActions(rule, preferences);
        const candidates = matched.slice(0, maxActions);
        const catalog = (!effectiveDryRun && destructive) ? await getArrCatalog(config) : { radarr: [], sonarr: [] };
        const dryRunCatalog = effectiveDryRun ? await getArrCatalog(config) : catalog;

        if (destructive) {
            const preflight = await validateMaintenanceDestructivePreflight(config, rule, catalog);
            run.preflight = { warnings: preflight.warnings };
            if (!preflight.ok) {
                throw new Error(preflight.errors.join(' '));
            }
        }

        const createAndPinCollection = !!runOptions.createAndPinCollection;
        const shouldCollectionSync = !effectiveDryRun && (rule?.collection?.enabled || createAndPinCollection);
        const uri = shouldCollectionSync ? await getPlexConnectionUri(config) : null;

        if (!effectiveDryRun && uri && shouldCollectionSync) {
            const ruleWithCollection = createAndPinCollection
                ? { ...rule, collection: { ...(rule?.collection || {}), enabled: true } }
                : rule;
            const collectionResult = await syncRulePlexCollection(config, uri, ruleWithCollection, candidates, { pinToHomeForAllUsers: createAndPinCollection });
            run.outcomes.push({ type: 'collection_sync', success: !!collectionResult.success, details: collectionResult });
        }

        const graceRemainingDays = computeRuleGraceRemainingDays(rule);

        for (const item of candidates) {
            if (graceRemainingDays > 0) {
                run.totals.skipped += 1;
                run.outcomes.push({
                    ratingKey: item.ratingKey,
                    title: item.title,
                    status: 'skipped',
                    reason: `Rule grace period active (${graceRemainingDays} day(s) remaining)`
                });
                continue;
            }
            if (effectiveDryRun) {
                run.totals.processed += 1;
                const resolved = resolveArrEntity(item, dryRunCatalog);
                run.outcomes.push({
                    ratingKey: item.ratingKey,
                    title: item.title,
                    status: 'dry_run',
                    arrResolvable: !!resolved.entity,
                    arrType: resolved.type,
                    proposedActions: rule.actions || {}
                });
                continue;
            }

            const resolved = resolveArrEntity(item, catalog);
            if (!resolved.entity) {
                run.totals.skipped += 1;
                run.outcomes.push({ ratingKey: item.ratingKey, title: item.title, status: 'unactionable', reason: 'No Sonarr/Radarr mapping available' });
                continue;
            }

            const actionResult = await applyArrActions(config, resolved, rule.actions || {});
            run.totals.processed += 1;
            if (actionResult.success) {
                run.totals.deleted += 1;
                run.outcomes.push({ ratingKey: item.ratingKey, title: item.title, status: 'deleted', arrType: resolved.type, arrId: resolved.entity.id });
                await appendAuditLog('maintenance_item_actioned', actor, null, {
                    ruleId: rule.id,
                    ruleName: rule.name,
                    ratingKey: item.ratingKey,
                    title: item.title,
                    arrType: resolved.type,
                    arrId: resolved.entity.id,
                    actions: rule.actions || {}
                });
            } else {
                run.totals.failed += 1;
                run.outcomes.push({ ratingKey: item.ratingKey, title: item.title, status: 'failed', reason: actionResult.reason || 'ARR action failed' });
            }
        }

        run.completedAt = new Date().toISOString();
        run.status = run.totals.failed > 0 ? 'completed_with_errors' : 'completed';
        return run;
    };

    const executeMaintenanceRunBatch = async ({ actor, ruleId = null, dryRun = undefined, confirmToken = null, runOptions = {} }) => {
        const config = await loadFile(configPath, {});
        if (!isMaintenanceExperimentalEnabled(config)) {
            throw new Error('Maintenance Experimental Mode is disabled. Enable it in Settings first.');
        }
        const rawRules = await loadFile(maintenanceRulesPath, []);
        const sourceRules = Array.isArray(rawRules) ? rawRules : [];
        let rulesChanged = false;
        const rules = sourceRules.map((rule) => {
            const graceDays = Math.max(0, Number(rule?.graceDays || 0));
            const createdAt = rule?.createdAt || new Date().toISOString();
            if (graceDays !== Number(rule?.graceDays || 0) || !rule?.createdAt) rulesChanged = true;
            return {
                ...rule,
                graceDays,
                createdAt
            };
        });
        if (rulesChanged) await saveFile(maintenanceRulesPath, rules);
        const selected = ruleId ? rules.filter(r => r.id === ruleId) : rules.filter(r => r.enabled !== false);
        if (!selected.length) {
            throw new Error('No enabled maintenance rule found.');
        }
        const existingRuns = await loadFile(maintenanceRunsPath, []);
        const newRuns = [];
        for (const rule of selected) {
            const run = await runMaintenanceRule({ rule, dryRun, actor, confirmToken, runOptions });
            newRuns.push(run);
        }
        const updatedRuns = [...newRuns, ...existingRuns].slice(0, 400);
        await saveFile(maintenanceRunsPath, updatedRuns);
        return newRuns;
    };

    return {
        MAINTENANCE_DEFAULTS,
        MAINTENANCE_PREFS_DEFAULTS,
        MAINTENANCE_FILTER_CATALOG,
        maintenanceRunState,
        isMaintenanceExperimentalEnabled,
        loadMaintenancePreferences,
        applyMaintenanceExclusions,
        sanitizeMaintenanceRuleForPersist,
        getMaintenanceSettings,
        buildMaintenancePreviewForRule,
        evaluateMaintenanceRule,
        getArrCatalog,
        invalidateArrCatalogCache,
        validateMaintenanceDestructivePreflight,
        buildMaintenanceMediaIndex,
        executeMaintenanceRunBatch,
    };
};
