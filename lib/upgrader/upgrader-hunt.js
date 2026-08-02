import { getReadyArrInstances } from '../media-stack/arr-instances.js';
import { rankUpgradeReleases } from './upgrader-ranker.js';

const findInstance = (config, item) => getReadyArrInstances(config)
    .find((instance) => String(instance.id) === String(item.arrInstanceId) && instance.type === item.arrType);

export const createUpgraderHunt = ({
    request,
    loadIndex,
    loadPrefs,
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
            const targetSeason = item.mediaType === 'show'
                ? (item.seasons || []).slice().sort((a, b) => a.avgCustomFormatScore - b.avgCustomFormatScore)[0]?.seasonNumber
                : null;
            const seasonMeta = (item.seasons || []).find((season) => season.seasonNumber === targetSeason);
            const current = item.mediaType === 'show' && seasonMeta
                ? {
                    ...item,
                    seasonFloorResolution: seasonMeta.minResolution || item.seasonFloorResolution,
                    customFormatScore: seasonMeta.avgCustomFormatScore ?? item.avgCustomFormatScore,
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

    const runHunt = async (config, { limit = null } = {}) => {
        if (!config.upgraderEnabled || !config.upgraderAutomationEnabled) {
            return { ran: false, reason: 'Automation disabled', results: [] };
        }
        const index = await loadIndex();
        const remaining = actionsRemaining(config);
        if (remaining <= 0) return { ran: false, reason: 'Rate limited', results: [] };

        const budget = Math.min(remaining, limit == null ? remaining : Number(limit) || remaining);
        const candidates = (index.items || [])
            .filter((item) => item.hasFile || (item.mediaType === 'show' && item.episodeCount > 0))
            .sort((a, b) => (
                Number(a.avgCustomFormatScore || a.customFormatScore || 0)
                - Number(b.avgCustomFormatScore || b.customFormatScore || 0)
            ));

        const results = [];
        let grabbed = 0;
        for (const item of candidates) {
            if (grabbed >= budget) break;
            if (await isExcluded(item.ratingKey)) continue;
            const outcome = await upgradeItem(config, item, { dryRun: false });
            results.push(outcome);
            if (outcome.grabbed) {
                grabbed += 1;
                log(`[upgrader] grabbed upgrade for ${item.title}: ${outcome.releaseTitle}`);
            }
        }
        return { ran: true, results, grabbed };
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
