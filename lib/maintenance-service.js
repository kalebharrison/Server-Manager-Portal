import { randomUUID } from 'crypto';
import fetch from 'node-fetch';

export const createMaintenanceService = ({
    configPath,
    maintenancePrefsPath,
    maintenanceMediaIndexPath,
    maintenanceRequestIndexPath,
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
    log,
}) => {
    const MAINTENANCE_DEFAULTS = {
        enabled: false,
        dryRunByDefault: true,
        maxActionsPerRun: 25,
        requireConfirmForDestructive: true
    };
    const isMaintenanceExperimentalEnabled = (config) => !!config?.maintenanceExperimentalEnabled;
    const MAINTENANCE_PREFS_DEFAULTS = {
        global: {
            dryRunByDefault: true,
            maxActionsPerRun: 25,
            requireConfirmForDestructive: true
        },
        exclusions: {
            ratingKeys: [],
            titles: [],
            libraries: []
        }
    };

    const MAINTENANCE_FILTER_CATALOG = [
        { field: 'mediaType', label: 'Media Type', type: 'select', options: ['movie', 'show'], operators: ['equals', 'not_equals', 'in', 'not_in'] },
        { field: 'libraryTitle', label: 'Library', type: 'text', operators: ['equals', 'not_equals', 'contains', 'not_contains', 'in', 'not_in'] },
        { field: 'title', label: 'Title', type: 'text', operators: ['contains', 'not_contains', 'equals', 'not_equals', 'regex'] },
        { field: 'year', label: 'Year', type: 'number', operators: ['equals', 'not_equals', 'greater_than', 'less_than', 'between'] },
        { field: 'watchCount', label: 'Watch Count', type: 'number', operators: ['equals', 'not_equals', 'greater_than', 'less_than', 'between'] },
        { field: 'watchedEver', label: 'Watched Ever', type: 'boolean', operators: ['equals'] },
        { field: 'daysSinceLastWatch', label: 'Days Since Last Watch', type: 'number', operators: ['greater_than', 'less_than', 'between'] },
        { field: 'daysSinceAdded', label: 'Days Since Added', type: 'number', operators: ['greater_than', 'less_than', 'between'] },
        { field: 'durationMinutes', label: 'Duration (minutes)', type: 'number', operators: ['greater_than', 'less_than', 'between'] },
        { field: 'sizeGB', label: 'File Size (GB)', type: 'number', operators: ['greater_than', 'less_than', 'between'] },
        { field: 'videoResolution', label: 'Resolution', type: 'select', options: ['4k', '2160', '1440', '1080', '720', '576', '480', 'sd'], operators: ['equals', 'not_equals', 'in', 'not_in', 'contains'] },
        { field: 'videoCodec', label: 'Video Codec', type: 'text', operators: ['equals', 'not_equals', 'contains', 'not_contains'] },
        { field: 'audioCodec', label: 'Audio Codec', type: 'text', operators: ['equals', 'not_equals', 'contains', 'not_contains'] },
        { field: 'bitrateKbps', label: 'Bitrate (Kbps)', type: 'number', operators: ['greater_than', 'less_than', 'between'] },
        { field: 'genres', label: 'Genres', type: 'array', operators: ['contains', 'not_contains', 'in', 'not_in', 'is_empty', 'not_empty'] },
        { field: 'collections', label: 'Collections', type: 'array', operators: ['contains', 'not_contains', 'in', 'not_in', 'is_empty', 'not_empty'] },
        { field: 'labels', label: 'Labels', type: 'array', operators: ['contains', 'not_contains', 'in', 'not_in', 'is_empty', 'not_empty'] },
        { field: 'studio', label: 'Studio/Network', type: 'text', operators: ['contains', 'not_contains', 'equals', 'not_equals'] },
        { field: 'contentRating', label: 'Content Rating', type: 'text', operators: ['equals', 'not_equals', 'contains', 'not_contains'] },
        { field: 'tmdbRating', label: 'TMDB Rating', type: 'number', operators: ['equals', 'not_equals', 'greater_than', 'less_than', 'between'] },
        { field: 'rtCriticRating', label: 'Rotten Tomatoes Critic', type: 'number', operators: ['equals', 'not_equals', 'greater_than', 'less_than', 'between'] },
        { field: 'rtAudienceRating', label: 'Rotten Tomatoes Audience', type: 'number', operators: ['equals', 'not_equals', 'greater_than', 'less_than', 'between'] },
        { field: 'traktRating', label: 'Trakt Rating', type: 'number', operators: ['equals', 'not_equals', 'greater_than', 'less_than', 'between'] },
        { field: 'arrType', label: 'ARR Mapping Type', type: 'select', options: ['radarr', 'sonarr', 'none'], operators: ['equals', 'not_equals'] },
        { field: 'arrMapped', label: 'ARR Mapped', type: 'boolean', operators: ['equals'] },
        { field: 'requestStatus', label: 'Request Status', type: 'text', operators: ['equals', 'not_equals', 'contains', 'not_contains', 'is_empty', 'not_empty'] },
        { field: 'requestType', label: 'Request Type', type: 'text', operators: ['equals', 'not_equals'] },
        { field: 'daysSinceRequested', label: 'Days Since Requested', type: 'number', operators: ['greater_than', 'less_than', 'between'] },
        { field: 'requestedBy', label: 'Requested By', type: 'text', operators: ['contains', 'not_contains', 'equals', 'not_equals'] },
        { field: 'is4k', label: '4K Item', type: 'boolean', operators: ['equals'] }
    ];

    const maintenanceRunState = { running: false, lastRunAt: null, lastError: null };
    const mToLower = (value) => String(value ?? '').toLowerCase();
    const mAsArray = (value) => Array.isArray(value) ? value : (value === undefined || value === null ? [] : [value]);
    const mToNumber = (value) => {
        const n = Number(value);
        return Number.isFinite(n) ? n : null;
    };
    const daysSince = (timestamp) => {
        if (!timestamp) return null;
        const t = Date.parse(timestamp);
        if (!Number.isFinite(t)) return null;
        return Math.floor((Date.now() - t) / (24 * 60 * 60 * 1000));
    };

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

    const applyMaintenanceExclusions = (items = [], preferences = MAINTENANCE_PREFS_DEFAULTS) => {
        const excludedKeys = new Set((preferences?.exclusions?.ratingKeys || []).map(v => String(v)));
        const excludedTitles = new Set((preferences?.exclusions?.titles || []).map(v => normalized(v)));
        const excludedLibraries = new Set((preferences?.exclusions?.libraries || []).map(v => normalized(v)));
        return (items || []).filter((item) => {
            if (!item) return false;
            if (excludedKeys.has(String(item.ratingKey || ''))) return false;
            if (excludedTitles.has(normalized(item.title))) return false;
            if (excludedLibraries.has(normalized(item.libraryTitle))) return false;
            return true;
        });
    };

    const parsePlexGuidIds = (guids = []) => {
        const parsed = { imdb: null, tmdb: null, tvdb: null };
        for (const g of guids) {
            const id = String(g?.id || '');
            if (!id) continue;
            const match = id.match(/^([a-z0-9]+):\/\/(.+)$/i);
            if (!match) continue;
            const kind = mToLower(match[1]);
            const raw = match[2];
            if (kind === 'imdb' && !parsed.imdb) parsed.imdb = raw;
            if (kind === 'tmdb' && !parsed.tmdb) parsed.tmdb = raw;
            if (kind === 'tvdb' && !parsed.tvdb) parsed.tvdb = raw;
        }
        return parsed;
    };

    const normalizeRequestItem = (input = {}) => ({
        id: input.id || input.requestId || input.mediaRequestId || null,
        status: input.status || input.requestStatus || input.state || '',
        type: input.type || input.mediaType || '',
        requestedBy: input.requestedBy || input.requestedByUsername || input.username || input.requestedByEmail || '',
        requestedAt: input.requestedAt || input.createdAt || input.requestDate || null,
        fulfilledAt: input.fulfilledAt || input.updatedAt || null,
        imdbId: input.imdbId || null,
        tmdbId: input.tmdbId ? String(input.tmdbId) : null,
        tvdbId: input.tvdbId ? String(input.tvdbId) : null
    });

    const getMaintenanceSettings = (rule) => ({
        ...MAINTENANCE_DEFAULTS,
        ...(rule?.settings || {})
    });

    const computeRuleGraceRemainingDays = (rule) => {
        const minGrace = Math.max(0, Number(rule?.graceDays || 0));
        const createdAtMs = Date.parse(String(rule?.createdAt || ''));
        const hasRuleCreatedAt = Number.isFinite(createdAtMs);
        const daysSinceRuleCreated = hasRuleCreatedAt
            ? Math.max(0, Math.floor((Date.now() - createdAtMs) / (24 * 60 * 60 * 1000)))
            : minGrace;
        return Math.max(0, minGrace - daysSinceRuleCreated);
    };

    const resolveMaintenanceMaxActions = (rule, preferences) => {
        const ruleMax = Number(rule?.settings?.maxActionsPerRun);
        if (Number.isFinite(ruleMax) && ruleMax > 0) return Math.max(1, Math.floor(ruleMax));
        const globalMax = Number(preferences?.global?.maxActionsPerRun);
        if (Number.isFinite(globalMax) && globalMax > 0) return Math.max(1, Math.floor(globalMax));
        return MAINTENANCE_DEFAULTS.maxActionsPerRun;
    };

    const sanitizeMaintenanceRuleForPersist = (rule) => {
        if (!rule || typeof rule !== 'object') return rule;
        const { overlay, _resetGrace, ...rest } = rule;
        return rest;
    };

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

    const maintenanceValueMap = (item, field) => {
        switch (field) {
            case 'mediaType': return item.mediaType || '';
            case 'libraryTitle': return item.libraryTitle || '';
            case 'title': return item.title || '';
            case 'year': return item.year ?? null;
            case 'watchCount': return item.watchCount ?? 0;
            case 'watchedEver': return !!item.watchedEver;
            case 'daysSinceLastWatch': return item.daysSinceLastWatch ?? null;
            case 'daysSinceAdded': return item.daysSinceAdded ?? null;
            case 'durationMinutes': return item.durationMinutes ?? null;
            case 'sizeGB': return item.sizeGB ?? null;
            case 'videoResolution': return item.videoResolution || '';
            case 'videoCodec': return item.videoCodec || '';
            case 'audioCodec': return item.audioCodec || '';
            case 'bitrateKbps': return item.bitrateKbps ?? null;
            case 'genres': return item.genres || [];
            case 'collections': return item.collections || [];
            case 'labels': return item.labels || [];
            case 'studio': return item.studio || '';
            case 'contentRating': return item.contentRating || '';
            case 'tmdbRating': return item.tmdbRating ?? null;
            case 'rtCriticRating': return item.rtCriticRating ?? null;
            case 'rtAudienceRating': return item.rtAudienceRating ?? null;
            case 'traktRating': return item.traktRating ?? null;
            case 'arrType': return item.arrType || 'none';
            case 'arrMapped': return !!item.arrMapped;
            case 'requestStatus': return item.request?.status || '';
            case 'requestType': return item.request?.type || '';
            case 'daysSinceRequested': return item.request?.daysSinceRequested ?? null;
            case 'requestedBy': return item.request?.requestedBy || '';
            case 'is4k': return !!item.is4k;
            default: return null;
        }
    };

    const compareMaintenanceValue = (itemValue, operator, expectedValue) => {
        if (operator === 'is_empty') return mAsArray(itemValue).filter(Boolean).length === 0 || itemValue === '' || itemValue === null;
        if (operator === 'not_empty') return !(mAsArray(itemValue).filter(Boolean).length === 0 || itemValue === '' || itemValue === null);
        if (operator === 'equals') return mToLower(itemValue) === mToLower(expectedValue);
        if (operator === 'not_equals') return mToLower(itemValue) !== mToLower(expectedValue);
        if (operator === 'contains') {
            if (Array.isArray(itemValue)) return itemValue.map(v => mToLower(v)).includes(mToLower(expectedValue));
            return mToLower(itemValue).includes(mToLower(expectedValue));
        }
        if (operator === 'not_contains') {
            if (Array.isArray(itemValue)) return !itemValue.map(v => mToLower(v)).includes(mToLower(expectedValue));
            return !mToLower(itemValue).includes(mToLower(expectedValue));
        }
        if (operator === 'in') {
            const expectedList = mAsArray(expectedValue).map(v => mToLower(v));
            if (Array.isArray(itemValue)) return itemValue.some(v => expectedList.includes(mToLower(v)));
            return expectedList.includes(mToLower(itemValue));
        }
        if (operator === 'not_in') {
            const expectedList = mAsArray(expectedValue).map(v => mToLower(v));
            if (Array.isArray(itemValue)) return !itemValue.some(v => expectedList.includes(mToLower(v)));
            return !expectedList.includes(mToLower(itemValue));
        }
        if (operator === 'regex') {
            try {
                const patternStr = String(expectedValue || '');
                // Guard against ReDoS: reject overly-long or structurally catastrophic patterns
                if (patternStr.length > 250) return false;
                if (/\(.*[+*]\).*[+*]|\(.*[+*]\)\{/.test(patternStr)) return false; // catastrophic backtracking heuristic
                const re = new RegExp(patternStr, 'i');
                // Limit input string length to cap worst-case backtracking
                return re.test(String(itemValue || '').slice(0, 1000));
            } catch (e) {
                return false;
            }
        }
        const left = mToNumber(itemValue);
        if (operator === 'greater_than') return left !== null && left > Number(expectedValue);
        if (operator === 'less_than') return left !== null && left < Number(expectedValue);
        if (operator === 'between') {
            const expected = mAsArray(expectedValue);
            const low = Number(expected[0]);
            const high = Number(expected[1]);
            return left !== null && Number.isFinite(low) && Number.isFinite(high) && left >= low && left <= high;
        }
        return false;
    };

    const evaluateMaintenanceFilterNode = (item, node) => {
        if (!node) return true;
        if (Array.isArray(node.conditions)) {
            const logic = String(node.logic || 'AND').toUpperCase();
            const outcomes = node.conditions.map((child) => evaluateMaintenanceFilterNode(item, child));
            if (logic === 'OR') return outcomes.some(Boolean);
            if (logic === 'NOT') return !outcomes.some(Boolean);
            return outcomes.every(Boolean);
        }
        const field = node.field;
        const operator = node.operator || 'equals';
        const value = node.value;
        const itemValue = maintenanceValueMap(item, field);
        return compareMaintenanceValue(itemValue, operator, value);
    };

    const evaluateMaintenanceRule = (item, rule) => {
        if (!rule || rule.enabled === false) return false;
        const root = rule.filterTree || rule.filter || null;
        if (!root) return false;
        return evaluateMaintenanceFilterNode(item, root);
    };

    const normalizePlexRatingKey = (input) => {
        const raw = String(input || '').trim();
        if (!raw) return '';
        const parts = raw.split('/');
        return String(parts[parts.length - 1] || '').trim();
    };

    const fetchMaintenanceWatchStats = async (config, uri) => {
        const pageSize = 5000;
        const maxHistoryItems = 250000;
        let start = 0;
        const map = new Map();

        while (start < maxHistoryItems) {
            const pageRes = await fetch(
                `${uri}/status/sessions/history/all?X-Plex-Token=${config.plexToken}&sort=viewedAt:desc&X-Plex-Container-Start=${start}&X-Plex-Container-Size=${pageSize}`,
                { headers: { Accept: 'application/json' } }
            ).then(r => r.json()).catch(() => null);

            const pageContainer = pageRes?.MediaContainer || {};
            const pageItems = Array.isArray(pageContainer.Metadata) ? pageContainer.Metadata : [];
            if (!pageItems.length) break;

            for (const item of pageItems) {
                // For episodes, map plays to the show (grandparent) so show-level rules are accurate.
                const rawKey = item.type === 'episode'
                    ? (item.grandparentRatingKey || item.grandparentKey || item.parentRatingKey || item.parentKey || item.ratingKey)
                    : (item.ratingKey);
                const key = normalizePlexRatingKey(rawKey);
                if (!key) continue;
                const viewedAt = Number(item.viewedAt || 0);
                const existing = map.get(key) || { watchCount: 0, lastViewedAt: null };
                existing.watchCount += 1;
                if (viewedAt > Number(existing.lastViewedAt || 0)) existing.lastViewedAt = viewedAt;
                map.set(key, existing);
            }

            start += pageItems.length;
            const totalSize = Number(pageContainer.totalSize || 0);
            if ((totalSize > 0 && start >= totalSize) || pageItems.length < pageSize) break;
        }

        if (start >= maxHistoryItems) {
            log(`Maintenance watch history fetch reached cap (${maxHistoryItems}). Watch counts may be truncated.`);
        }

        return map;
    };

    const extractMaintenanceRatings = (media = {}) => {
        const ratings = {
            tmdbRating: null,
            rtCriticRating: null,
            rtAudienceRating: null,
            traktRating: null
        };
        const asNum = (v) => {
            const n = Number(v);
            return Number.isFinite(n) ? n : null;
        };

        const rawRatings = Array.isArray(media?.Rating) ? media.Rating : [];
        rawRatings.forEach((entry) => {
            const source = `${entry?.type || ''} ${entry?.image || ''} ${entry?.id || ''} ${entry?.source || ''}`.toLowerCase();
            const value = asNum(entry?.value ?? entry?.rating ?? entry?.score);
            if (value === null) return;
            if (source.includes('themoviedb') || source.includes('tmdb')) {
                ratings.tmdbRating = ratings.tmdbRating ?? value;
            } else if (source.includes('rottentomatoes') || source.includes('rotten')) {
                // Plex can expose critic/audience RT entries; infer using label hints.
                if (source.includes('audience')) ratings.rtAudienceRating = ratings.rtAudienceRating ?? value;
                else ratings.rtCriticRating = ratings.rtCriticRating ?? value;
            } else if (source.includes('trakt')) {
                ratings.traktRating = ratings.traktRating ?? value;
            }
        });

        // Fallback to generic Plex rating fields when source-specific values are not present.
        if (ratings.tmdbRating === null && asNum(media?.rating) !== null) ratings.tmdbRating = asNum(media.rating);
        if (ratings.rtCriticRating === null && asNum(media?.audienceRating) !== null) ratings.rtCriticRating = asNum(media.audienceRating);
        if (ratings.rtAudienceRating === null && asNum(media?.audienceRating) !== null) ratings.rtAudienceRating = asNum(media.audienceRating);
        if (ratings.traktRating === null && asNum(media?.rating) !== null) ratings.traktRating = asNum(media.rating);

        return ratings;
    };

    const fetchPlexLibraryItemsForMaintenance = async (config, uri) => {
        const watchStats = await fetchMaintenanceWatchStats(config, uri);
        const sectionsRes = await fetch(`${uri}/library/sections?X-Plex-Token=${config.plexToken}`, { headers: { Accept: 'application/json' } })
            .then(r => r.json())
            .catch(() => null);
        const sections = sectionsRes?.MediaContainer?.Directory || [];
        const includeTypes = new Set(['movie', 'show']);
        const items = [];

        for (const section of sections) {
            if (!includeTypes.has(String(section.type || ''))) continue;
            const sectionKey = section.key;
            let start = 0;
            const pageSize = 200;
            let total = Infinity;
            while (start < total) {
                const listRes = await fetch(`${uri}/library/sections/${sectionKey}/all?X-Plex-Token=${config.plexToken}&X-Plex-Container-Start=${start}&X-Plex-Container-Size=${pageSize}`, {
                    headers: { Accept: 'application/json' }
                }).then(r => r.json()).catch(() => null);
                const container = listRes?.MediaContainer || {};
                const page = container.Metadata || [];
                total = Number(container.totalSize || page.length || 0);
                if (!Array.isArray(page) || page.length === 0) break;
                for (const media of page) {
                    const guids = media.Guid || [];
                    const ids = parsePlexGuidIds(guids);
                    const part = media?.Media?.[0]?.Part?.[0] || {};
                    const mediaInfo = media?.Media?.[0] || {};
                    const ratings = extractMaintenanceRatings(media);
                    const mediaType = media.type || section.type || 'movie';
                    // For TV shows, Plex exposes episode-level progress via viewedLeafCount.
                    // viewCount on shows is often null/0 even when episodes were watched.
                    const resolvedWatchCount = mediaType === 'show'
                        ? Number(media.viewedLeafCount || 0)
                        : Number(media.viewCount || 0);
                    const normalizedRatingKey = normalizePlexRatingKey(media.ratingKey);
                    const aggregatedWatch = watchStats.get(normalizedRatingKey) || null;
                    const finalWatchCount = Number(aggregatedWatch?.watchCount ?? resolvedWatchCount ?? 0);
                    const finalLastViewedAtUnix = Number(aggregatedWatch?.lastViewedAt || media.lastViewedAt || 0);
                    const item = {
                        ratingKey: String(media.ratingKey || ''),
                        title: media.title || media.grandparentTitle || media.originalTitle || 'Unknown',
                        thumb: media.thumb || media.grandparentThumb || '',
                        mediaType,
                        libraryId: String(sectionKey),
                        libraryTitle: section.title || 'Library',
                        year: media.year || null,
                        watchCount: finalWatchCount,
                        watchedEver: finalWatchCount > 0,
                        addedAt: media.addedAt ? new Date(media.addedAt * 1000).toISOString() : null,
                        lastViewedAt: finalLastViewedAtUnix ? new Date(finalLastViewedAtUnix * 1000).toISOString() : null,
                        daysSinceAdded: media.addedAt ? Math.floor((Date.now() - (media.addedAt * 1000)) / (24 * 60 * 60 * 1000)) : null,
                        daysSinceLastWatch: finalLastViewedAtUnix ? Math.floor((Date.now() - (finalLastViewedAtUnix * 1000)) / (24 * 60 * 60 * 1000)) : null,
                        durationMinutes: media.duration ? Math.round(media.duration / 60000) : null,
                        bitrateKbps: Number(mediaInfo.bitrate || 0),
                        videoResolution: String(mediaInfo.videoResolution || '').toLowerCase(),
                        videoCodec: String(mediaInfo.videoCodec || '').toLowerCase(),
                        audioCodec: String(mediaInfo.audioCodec || '').toLowerCase(),
                        sizeBytes: Number(part.size || 0),
                        sizeGB: part.size ? Math.round((Number(part.size) / (1024 * 1024 * 1024)) * 100) / 100 : 0,
                        filePath: part.file || '',
                        genres: (media.Genre || []).map(g => g.tag).filter(Boolean),
                        collections: (media.Collection || []).map(c => c.tag).filter(Boolean),
                        labels: (media.Label || []).map(l => l.tag).filter(Boolean),
                        studio: media.studio || '',
                        contentRating: media.contentRating || '',
                        tmdbRating: ratings.tmdbRating,
                        rtCriticRating: ratings.rtCriticRating,
                        rtAudienceRating: ratings.rtAudienceRating,
                        traktRating: ratings.traktRating,
                        imdbId: ids.imdb,
                        tmdbId: ids.tmdb,
                        tvdbId: ids.tvdb,
                        arrType: section.type === 'movie' ? 'radarr' : 'sonarr',
                        arrMapped: !!(ids.tmdb || ids.tvdb || ids.imdb),
                        request: null,
                        is4k: String(mediaInfo.videoResolution || '').toLowerCase().includes('4k') || String(mediaInfo.videoResolution || '').toLowerCase().includes('2160')
                    };
                    items.push(item);
                }
                start += page.length;
                if (page.length < pageSize) break;
            }
        }
        return items;
    };

    const fetchRequestIndex = async (config) => {
        const requestAppType = String(config.requestAppType || 'none').toLowerCase();
        const baseUrlRaw = config.requestAppUrl || '';
        const apiKey = config.requestAppApiKey || '';
        if (!baseUrlRaw || !apiKey || requestAppType === 'none') {
            return { generatedAt: new Date().toISOString(), type: requestAppType, items: [] };
        }
        const baseUrl = resolveIntegrationUrlForFetch(baseUrlRaw);
        const headers = { Accept: 'application/json', 'Content-Type': 'application/json', 'X-Api-Key': apiKey };
        const items = [];

        if (requestAppType === 'seerr' || requestAppType === 'overseerr' || requestAppType === 'jellyseerr') {
            let page = 1;
            let totalPages = 1;
            while (page <= totalPages && page <= 20) {
                const take = 50;
                const skip = (page - 1) * take;
                const payload = await fetch(`${baseUrl}/api/v1/request?take=${take}&skip=${skip}`, { headers }).then(r => r.json()).catch(() => null);
                const results = payload?.results || [];
                const pageInfo = payload?.pageInfo || {};
                totalPages = Math.max(1, Math.ceil(Number(pageInfo.results || results.length || 0) / take));
                results.forEach((reqItem) => {
                    const media = reqItem?.media || {};
                    const requestedBy = reqItem?.requestedBy?.displayName || reqItem?.requestedBy?.username || reqItem?.requestedBy?.email || '';
                    items.push(normalizeRequestItem({
                        id: reqItem?.id,
                        status: reqItem?.status || '',
                        type: reqItem?.type || media?.mediaType || '',
                        requestedBy,
                        requestedAt: reqItem?.createdAt || reqItem?.createdAtUtc || null,
                        fulfilledAt: reqItem?.updatedAt || null,
                        imdbId: media?.imdbId || null,
                        tmdbId: media?.tmdbId || null,
                        tvdbId: media?.tvdbId || null
                    }));
                });
                page += 1;
                if (!results.length) break;
            }
        } else if (requestAppType === 'ombi') {
            const [movieReqs, tvReqs] = await Promise.all([
                fetch(`${baseUrl}/api/v1/Request/movie`, { headers }).then(r => r.json()).catch(() => []),
                fetch(`${baseUrl}/api/v1/Request/tv`, { headers }).then(r => r.json()).catch(() => [])
            ]);
            for (const reqItem of [...(Array.isArray(movieReqs) ? movieReqs : []), ...(Array.isArray(tvReqs) ? tvReqs : [])]) {
                const requester = reqItem?.requestedUserName || reqItem?.requestedByAlias || reqItem?.requestedBy || '';
                items.push(normalizeRequestItem({
                    id: reqItem?.id || reqItem?.requestId,
                    status: reqItem?.status || reqItem?.requestStatus || '',
                    type: reqItem?.requestType || (reqItem?.theMovieDbId ? 'movie' : 'tv'),
                    requestedBy: requester,
                    requestedAt: reqItem?.requestedDate || reqItem?.createdAt || null,
                    fulfilledAt: reqItem?.availableDate || null,
                    imdbId: reqItem?.imdbId || null,
                    tmdbId: reqItem?.theMovieDbId || null,
                    tvdbId: reqItem?.tvDbId || null
                }));
            }
        }
        return { generatedAt: new Date().toISOString(), type: requestAppType, items };
    };

    const attachRequestsToMediaIndex = (mediaItems, requestIndex) => {
        const map = new Map();
        for (const reqItem of requestIndex.items || []) {
            const keys = [reqItem.tmdbId ? `tmdb:${reqItem.tmdbId}` : null, reqItem.tvdbId ? `tvdb:${reqItem.tvdbId}` : null, reqItem.imdbId ? `imdb:${reqItem.imdbId}` : null].filter(Boolean);
            keys.forEach((key) => map.set(key, reqItem));
        }
        return mediaItems.map((item) => {
            const req =
                (item.tmdbId && map.get(`tmdb:${item.tmdbId}`)) ||
                (item.tvdbId && map.get(`tvdb:${item.tvdbId}`)) ||
                (item.imdbId && map.get(`imdb:${item.imdbId}`)) ||
                null;
            return {
                ...item,
                request: req ? {
                    ...req,
                    daysSinceRequested: daysSince(req.requestedAt),
                    daysSinceFulfilled: daysSince(req.fulfilledAt)
                } : null
            };
        });
    };

    const buildMaintenanceMediaIndex = async ({ actor = null, force = false } = {}) => {
        markTaskStart(systemJobs.maintenanceIndex);
        try {
            const config = await loadFile(configPath, {});
            if (!isMaintenanceExperimentalEnabled(config)) {
                const payload = {
                    generatedAt: null,
                    itemCount: 0,
                    requestItemCount: 0,
                    force: !!force,
                    items: []
                };
                markTaskEnd(systemJobs.maintenanceIndex, null);
                return payload;
            }
            if (!config?.plexToken || !config?.serverIdentifier) {
                throw new Error('Plex integration is not configured.');
            }
            const uri = await getPlexConnectionUri(config);
            if (!uri) throw new Error('Unable to resolve Plex server URI.');
            const rawMedia = await fetchPlexLibraryItemsForMaintenance(config, uri);
            const requestIndex = await fetchRequestIndex(config);
            const merged = attachRequestsToMediaIndex(rawMedia, requestIndex);
            const payload = {
                generatedAt: new Date().toISOString(),
                itemCount: merged.length,
                requestItemCount: (requestIndex.items || []).length,
                force: !!force,
                items: merged
            };
            await saveFile(maintenanceMediaIndexPath, payload);
            await saveFile(maintenanceRequestIndexPath, requestIndex);
            markTaskEnd(systemJobs.maintenanceIndex, null);
            await appendAuditLog('maintenance_index_rebuilt', actor, null, { itemCount: merged.length, requestItemCount: requestIndex.items?.length || 0 });
            return payload;
        } catch (error) {
            markTaskEnd(systemJobs.maintenanceIndex, error);
            throw error;
        }
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
