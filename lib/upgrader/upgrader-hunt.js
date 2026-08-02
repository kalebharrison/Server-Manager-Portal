import { getReadyArrInstances } from '../media-stack/arr-instances.js';
import { rankUpgradeReleases } from './upgrader-ranker.js';
import {
    buildHuntQueue,
    libraryKeyForItem,
    libraryLabelForItem,
    nextCooldownUntil,
    pruneCooldowns,
} from './upgrader-hunt-queue.js';

const findInstance = (config, item) => getReadyArrInstances(config)
    .find((instance) => String(instance.id) === String(item.arrInstanceId) && instance.type === item.arrType);

export const createUpgraderHunt = ({
    request,
    loadIndex,
    loadPrefs,
    savePrefs = null,
    appendAudit,
    log = () => {},
}) => {
    const recentActions = [];

    const pruneActions = () => {
        const cutoff = Date.now() - (60 * 60 * 1000);
        while (recentActions.length && recentActions[0] < cutoff) recentActions.shift();
    };

    const actionsRemaining = (config) => {
        pruneActions();
        const max = Math.max(1, Number(config.upgraderMaxActionsPerHour) || 25);
        return Math.max(0, max - recentActions.length);
    };

    const markAction = () => {
        recentActions.push(Date.now());
    };

    const persistCooldownoldown = async (ratingKey, kind, reason = null) => {
        if (!savePrefs || !ratingKey) return;
        const prefs = await loadPrefs();
        const cooldowns = pruneCooldowns(prefs.huntCooldowns || {});
        cooldowns[ratingKey] = {
            until: nextCooldownUntil(kind),
            reason: reason || kind,
        };
        const next = {
            ...prefs,
            huntCooldowns: cooldowns,
        };
        await savePrefs(next);
    };

    const advanceLibraryCursor = async (nextLibraryCursor) => {
        if (!savePrefs) return;
        const prefs = await loadPrefs();
        await savePrefs({
            ...prefs,
            huntLibraryCursor: Number(nextLibraryCursor) || 0,
            huntCooldowns: pruneCooldowns(prefs.huntCooldowns || {}),
        });
    };

    const isExcluded = async (ratingKey) => {
        const prefs = await loadPrefs();
        if ((prefs.excludedRatingKeys || []).includes(ratingKey)) return true;
        const until = prefs.snoozed?.[ratingKey];
        return until && Date.parse(until) > Date.now();
    };

    const fetchReleases = async (instance, item, { seasonNumber = null } = {}) => {
        if (item.arrType === 'radarr') {
            return request(instance, `/api/v3/release?movieId=${encodeURIComponent(item.entityId)}`);
        }
        if (seasonNumber != null) {
            try {
                return await request(
                    instance,
                    `/api/v3/release?seriesId=${encodeURIComponent(item.entityId)}&seasonNumber=${encodeURIComponent(seasonNumber)}`,
                );
            } catch {
                // fall through to episode search
            }
        }
        const episodes = Array.isArray(item.episodes) ? item.episodes : [];
        const episodeId = episodes.find((episode) => (
            seasonNumber == null || Number(episode.seasonNumber) === Number(seasonNumber)
        ))?.episodeId;
        if (!episodeId) return [];
        return request(instance, `/api/v3/release?episodeId=${encodeURIComponent(episodeId)}`);
    };

    const postRelease = async (instance, release) => request(instance, '/api/v3/release', {
        method: 'POST',
        body: release,
    });

    const previewItem = async (config, item) => {
        const instance = findInstance(config, item);
        if (!instance) {
            return {
                ratingKey: item.ratingKey,
                title: item.title,
                success: false,
                reason: 'Arr instance not found',
            };
        }
        if (item.mediaType === 'movie' && !item.hasFile) {
            return {
                ratingKey: item.ratingKey,
                title: item.title,
                success: false,
                skipped: true,
                reason: 'No file on disk yet',
            };
        }
        if (item.mediaType === 'show' && !(item.episodeCount > 0)) {
            return {
                ratingKey: item.ratingKey,
                title: item.title,
                success: false,
                skipped: true,
                reason: 'No episode files on disk yet',
            };
        }

        try {
            const scoredSeasons = (item.seasons || []).filter((season) => !season.scoreUnknown
                && Number.isFinite(Number(season.avgCustomFormatScore)));
            const targetSeason = item.mediaType === 'show'
                ? scoredSeasons.slice().sort((a, b) => Number(a.avgCustomFormatScore) - Number(b.avgCustomFormatScore))[0]?.seasonNumber
                    ?? (item.seasons || []).find((season) => !season.scoreUnknown)?.seasonNumber
                    ?? null
                : null;
            const seasonMeta = (item.seasons || []).find((season) => season.seasonNumber === targetSeason);
            const current = item.mediaType === 'show' && seasonMeta
                ? {
                    ...item,
                    seasonFloorResolution: seasonMeta.minResolution || item.seasonFloorResolution,
                    customFormatScore: seasonMeta.avgCustomFormatScore ?? item.avgCustomFormatScore ?? 0,
                    hasHdr: seasonMeta.hasHdr,
                    hasDolbyVision: seasonMeta.hasDolbyVision,
                    hasAtmos: seasonMeta.hasAtmos,
                    isRemux: seasonMeta.isRemux,
                }
                : item;

            const releases = await fetchReleases(instance, item, { seasonNumber: targetSeason });
            const ranked = rankUpgradeReleases(current, Array.isArray(releases) ? releases : [], config);
            if (!ranked.winner) {
                return {
                    ratingKey: item.ratingKey,
                    title: item.title,
                    success: false,
                    skipped: true,
                    reason: ranked.results.find((entry) => entry.reason)?.reason || 'No better release found',
                    arrInstanceName: item.arrInstanceName,
                    currentScore: ranked.currentScored.totalScore,
                    currentProfileName: item.qualityName || null,
                    currentTier: ranked.currentTier,
                };
            }
            const winner = ranked.winner;
            return {
                ratingKey: item.ratingKey,
                title: item.title,
                success: true,
                arrInstanceName: item.arrInstanceName,
                arrInstanceId: item.arrInstanceId,
                arrType: item.arrType,
                entityId: item.entityId,
                currentScore: ranked.currentScored.totalScore,
                candidateScore: winner.scored.totalScore,
                scoreDelta: winner.delta,
                boostReasons: winner.scored.reasons,
                fullSeason: winner.fullSeason,
                qualityName: winner.quality.qualityName,
                resolution: winner.quality.resolution,
                source: winner.quality.source,
                currentProfileName: item.qualityName || null,
                targetProfileName: winner.quality.qualityName || null,
                releaseTitle: winner.release?.title || winner.release?.releaseTitle || null,
                release: winner.release,
                seasonNumber: targetSeason,
            };
        } catch (error) {
            return {
                ratingKey: item.ratingKey,
                title: item.title,
                success: false,
                reason: error.message || 'Search failed',
                arrInstanceName: item.arrInstanceName,
            };
        }
    };

    const upgradeItem = async (config, item, { dryRun = false } = {}) => {
        const preview = await previewItem(config, item);
        if (!preview.success) return preview;
        if (dryRun) return { ...preview, dryRun: true };
        if (actionsRemaining(config) <= 0) {
            return {
                ...preview,
                success: false,
                reason: 'Maximum actions per hour reached',
            };
        }
        const instance = findInstance(config, item);
        try {
            await postRelease(instance, preview.release);
            markAction();
            await appendAudit({
                action: 'upgrade',
                success: true,
                ratingKey: item.ratingKey,
                title: item.title,
                arrInstanceId: item.arrInstanceId,
                arrInstanceName: item.arrInstanceName,
                arrType: item.arrType,
                libraryKey: libraryKeyForItem(item),
                libraryName: libraryLabelForItem(item),
                currentScore: preview.currentScore,
                candidateScore: preview.candidateScore,
                releaseTitle: preview.releaseTitle,
                fullSeason: preview.fullSeason,
                seasonNumber: preview.seasonNumber,
            });
            return { ...preview, grabbed: true };
        } catch (error) {
            await appendAudit({
                action: 'upgrade',
                success: false,
                reason: error.message,
                ratingKey: item.ratingKey,
                title: item.title,
            });
            return {
                ...preview,
                success: false,
                reason: error.message || 'Grab failed',
            };
        }
    };

    const searchItem = async (config, item, body = {}) => {
        const instance = findInstance(config, item);
        if (!instance) return { success: false, reason: 'Arr instance not found' };
        const command = item.arrType === 'radarr'
            ? { name: 'MoviesSearch', movieIds: [item.entityId] }
            : body.scope === 'episode' && body.episodeIds?.length
                ? { name: 'EpisodeSearch', episodeIds: body.episodeIds }
                : { name: 'SeriesSearch', seriesId: item.entityId };
        const result = await request(instance, '/api/v3/command', {
            method: 'POST',
            body: command,
        });
        await appendAudit({
            action: item.arrType === 'radarr' ? 'movie_search' : 'series_search',
            success: true,
            ratingKey: item.ratingKey,
            title: item.title,
            commandId: result?.id || null,
        });
        return { success: true, commandId: result?.id || null };
    };

    const runHunt = async (config, { limit = null, dryRun = false } = {}) => {
        if (!config.upgraderEnabled) {
            return { ran: false, reason: 'Quality Hunt disabled', results: [], dryRun: !!dryRun };
        }
        if (!dryRun && !config.upgraderAutomationEnabled) {
            return { ran: false, reason: 'Automation disabled', results: [], dryRun: false };
        }

        const index = await loadIndex();
        const prefs = await loadPrefs();
        const remaining = dryRun
            ? Math.max(1, Number(config.upgraderMaxActionsPerHour) || 25)
            : actionsRemaining(config);
        if (!dryRun && remaining <= 0) return { ran: false, reason: 'Rate limited', results: [], dryRun: false };

        const budget = Math.min(remaining, limit == null ? remaining : Number(limit) || remaining);
        // Dry-run stays small so Arr interactive search finishes before proxies time out.
        const maxPerLibrary = dryRun
            ? Math.max(1, Math.min(3, Number(limit) || Number(config.upgraderDryRunPerLibrary) || 2))
            : Math.max(
                2,
                Number(config.upgraderMaxSearchesPerLibrary) || Math.max(3, Math.ceil(budget / 2)),
            );

        const indexItems = index.items || [];
        const planned = buildHuntQueue(indexItems, {
            // Dry-run ignores cooldowns so you can preview the current queue.
            cooldowns: dryRun ? {} : (prefs.huntCooldowns || {}),
            excludedRatingKeys: prefs.excludedRatingKeys || [],
            snoozed: prefs.snoozed || {},
            libraryCursor: dryRun ? 0 : (prefs.huntLibraryCursor || 0),
            maxPerLibrary,
        });

        // Always report every indexed library, even when none were eligible/sampled.
        const libraryStats = new Map();
        for (const item of indexItems) {
            const key = libraryKeyForItem(item);
            if (!libraryStats.has(key)) {
                libraryStats.set(key, {
                    key,
                    label: libraryLabelForItem(item),
                    indexed: 0,
                    withFiles: 0,
                    available: 0,
                    considered: 0,
                });
            }
            const stat = libraryStats.get(key);
            stat.indexed += 1;
            const episodeCount = Number(item.episodeCount || item.totalEpisodeCount || 0);
            if (item.hasFile || (item.mediaType === 'show' && episodeCount > 0)) stat.withFiles += 1;
        }
        for (const lib of (planned.libraries || [])) {
            const stat = libraryStats.get(lib.key) || {
                key: lib.key,
                label: lib.label,
                indexed: 0,
                withFiles: 0,
                available: 0,
                considered: 0,
            };
            stat.available = lib.available;
            stat.considered = lib.considered;
            stat.label = lib.label || stat.label;
            libraryStats.set(lib.key, stat);
        }

        if (!dryRun) {
            await advanceLibraryCursor(planned.nextLibraryCursor);
        }

        if (!planned.queue.length) {
            return {
                ran: true,
                dryRun: !!dryRun,
                results: [],
                grabbed: 0,
                wouldGrab: 0,
                searched: 0,
                skipped: 0,
                libraries: [...libraryStats.values()]
                    .filter((lib) => lib.withFiles > 0 || lib.available > 0 || lib.considered > 0)
                    .sort((a, b) => a.label.localeCompare(b.label)),
                maxPerLibrary: planned.maxPerLibrary,
                reason: 'No eligible titles in the hunt queue (empty index, all excluded/snoozed, or no files on disk). Refresh index if Sonarr/Radarr looks empty here.',
            };
        }

        const results = [];
        let grabbed = 0;
        let searched = 0;
        let wouldGrab = 0;
        let skipped = 0;

        for (const item of planned.queue) {
            if (!dryRun && grabbed >= budget) break;
            if (await isExcluded(item.ratingKey)) continue;

            searched += 1;
            const outcome = await upgradeItem(config, item, { dryRun: !!dryRun });
            const enriched = {
                ...outcome,
                thumbUrl: item.thumbUrl || null,
                libraryKey: libraryKeyForItem(item),
                libraryName: libraryLabelForItem(item),
            };
            results.push(enriched);

            if (dryRun) {
                if (outcome.success) wouldGrab += 1;
                else skipped += 1;
                continue;
            }

            if (outcome.grabbed) {
                grabbed += 1;
                await persistCooldownoldown(item.ratingKey, 'grabbed', 'grabbed');
                log(`[upgrader] grabbed upgrade for ${item.title}: ${outcome.releaseTitle}`);
                continue;
            }

            if (outcome.skipped || outcome.success === false) {
                skipped += 1;
                const kind = outcome.reason && /not found|failed|error|returned \d+/i.test(outcome.reason)
                    ? 'error'
                    : 'noUpgrade';
                await persistCooldownoldown(item.ratingKey, kind, outcome.reason || kind);
            }
        }

        return {
            ran: true,
            dryRun: !!dryRun,
            results,
            grabbed,
            wouldGrab,
            searched,
            skipped,
            libraries: [...libraryStats.values()]
                .filter((lib) => lib.withFiles > 0 || lib.available > 0 || lib.considered > 0)
                .sort((a, b) => a.label.localeCompare(b.label)),
            maxPerLibrary: planned.maxPerLibrary,
        };
    };

    return {
        actionsRemaining,
        previewItem,
        upgradeItem,
        searchItem,
        runHunt,
        fetchReleases,
        postRelease,
    };
};
