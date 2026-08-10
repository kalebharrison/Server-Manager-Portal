import { getReadyArrInstances } from '../media-stack/arr-instances.js';

/**
 * Hold TV Discord announces while Sonarr still has queue activity for the series,
 * or recent season imports that Integrity has not announced yet (remux lag).
 */
export const createSonarrSeriesBusyCheck = ({ request, log = () => {} } = {}) => {
    const debounceMs = (config) => {
        const minutes = Math.max(1, Math.min(180, Number(config?.discordMediaAnnounceDebounceMinutes) || 60));
        return minutes * 60 * 1000;
    };

    return async (config, group = {}) => {
        const arrType = String(group.arrType || '').toLowerCase();
        const mediaType = String(group.mediaType || '').toLowerCase();
        if (arrType !== 'sonarr' && mediaType !== 'show') return false;
        const seriesId = group.entityId;
        if (seriesId == null) return false;

        const instance = getReadyArrInstances(config).find((entry) => (
            entry.type === 'sonarr'
            && (group.arrInstanceId == null || String(entry.id) === String(group.arrInstanceId))
        ));
        if (!instance || typeof request !== 'function') return false;

        try {
            const queueQs = new URLSearchParams({
                seriesId: String(seriesId),
                pageSize: '50',
                includeEpisode: 'false',
            });
            const queue = await request(instance, `/api/v3/queue?${queueQs.toString()}`);
            const queueRecords = Array.isArray(queue?.records) ? queue.records : (Array.isArray(queue) ? queue : []);
            if (queueRecords.some((row) => Number(row?.seriesId) === Number(seriesId))) {
                return true;
            }

            const season = Number(group.seasonNumber);
            const announcedEpisodeIds = new Set(
                (Array.isArray(group.items) ? group.items : [])
                    .map((item) => item?.episodeId)
                    .filter((id) => id != null)
                    .map((id) => String(id)),
            );
            const announcedFileIds = new Set(
                (Array.isArray(group.items) ? group.items : [])
                    .map((item) => item?.episodeFileId)
                    .filter((id) => id != null)
                    .map((id) => String(id)),
            );
            const announcedKeys = new Set(
                (Array.isArray(group.items) ? group.items : [])
                    .map((item) => item?.key)
                    .filter(Boolean)
                    .map((key) => String(key)),
            );

            const historyQs = new URLSearchParams({
                seriesId: String(seriesId),
                eventType: 'downloadFolderImported',
                pageSize: '40',
                includeEpisode: 'true',
            });
            const history = await request(instance, `/api/v3/history?${historyQs.toString()}`);
            const historyRecords = Array.isArray(history?.records)
                ? history.records
                : (Array.isArray(history) ? history : []);
            const cutoff = Date.now() - debounceMs(config);
            for (const row of historyRecords) {
                const at = Date.parse(row?.date || '');
                if (!Number.isFinite(at) || at < cutoff) continue;
                const rowSeason = Number(
                    row?.episode?.seasonNumber
                    ?? row?.seasonNumber
                    ?? row?.data?.seasonNumber,
                );
                if (Number.isFinite(season) && Number.isFinite(rowSeason) && rowSeason !== season) continue;

                const episodeId = row?.episodeId ?? row?.episode?.id;
                const fileId = row?.episodeFileId ?? row?.episodeFile?.id;
                const keyGuess = episodeId != null
                    ? `sonarr:${instance.id}:${seriesId}:file:${fileId || episodeId}`
                    : null;
                const known = (
                    (episodeId != null && announcedEpisodeIds.has(String(episodeId)))
                    || (fileId != null && announcedFileIds.has(String(fileId)))
                    || (keyGuess && announcedKeys.has(keyGuess))
                );
                if (!known) return true;
            }
            return false;
        } catch (error) {
            log(`[discord] sonarr busy-check failed: ${error.message}`);
            return false;
        }
    };
};
