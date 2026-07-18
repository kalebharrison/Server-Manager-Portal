import { normalizePlexBandwidthKbps } from '../plex/plex-bandwidth.js';
import { PLEX_STATS_CACHE_VERSION } from '../plex/plex-stats-service.js';
import { createKillRuleEvaluator, mapPlexSessionForKillRules } from './stream-kill-rules.js';

export { validateKillRulesSchema } from './stream-kill-rules.js';

export const createStreamMonitor = ({
    configPath,
    killRulesPath,
    plexStatsCachePath,
    loadFile,
    saveFile,
    getPlexConnectionUri,
    fetchWithTimeout,
    plexSessionsSnapshot = null,
    appendAuditLog,
    log,
}) => {
    let monitorRunning = false;
    const fetchSessionsPayload = plexSessionsSnapshot?.fetchSessionsPayload
        || (async (config, uri) => fetchWithTimeout(`${uri}/status/sessions?X-Plex-Token=${config.plexToken}`, { headers: { Accept: 'application/json' } }, 10000)
            .then((r) => (r.ok ? r.json() : null))
            .catch(() => null));

    const { evaluateKillRules } = createKillRuleEvaluator({
        killRulesPath,
        loadFile,
        fetchWithTimeout,
        appendAuditLog,
        log,
    });

    async function monitorConcurrentSessions() {
        if (monitorRunning) return;
        monitorRunning = true;
        try {
            const config = await loadFile(configPath, null);
            if (!config || !config.plexToken || !config.serverIdentifier) return;

            const uri = await getPlexConnectionUri(config);
            if (!uri) return;

            const sessionsRes = await fetchSessionsPayload(config, uri);

            if (sessionsRes && sessionsRes.MediaContainer) {
                const currentStreams = sessionsRes.MediaContainer.size || 0;

                if (sessionsRes.MediaContainer.Metadata) {
                    const sessionObjs = sessionsRes.MediaContainer.Metadata.map((metadata) => {
                        const mapped = mapPlexSessionForKillRules(metadata);
                        return {
                            ...mapped,
                            bandwidth: normalizePlexBandwidthKbps(mapped.bandwidth),
                        };
                    });
                    await evaluateKillRules(config, uri, sessionObjs);
                }
                let currentDirect = 0;
                let currentTranscodes = 0;

                if (sessionsRes.MediaContainer.Metadata) {
                    sessionsRes.MediaContainer.Metadata.forEach(m => {
                        let isTranscode = false;
                        if (m.TranscodeSession) {
                            isTranscode = true;
                        } else if (m.Media && m.Media.length > 0) {
                            for (const media of m.Media) {
                                if (media.Part && media.Part.length > 0) {
                                    for (const part of media.Part) {
                                        if (part.decision === 'transcode' || (part.Stream && part.Stream.some(s => s.decision === 'transcode'))) {
                                            isTranscode = true;
                                            break;
                                        }
                                    }
                                }
                            }
                        }
                        if (isTranscode) {
                            currentTranscodes++;
                        } else {
                            currentDirect++;
                        }
                    });
                }

                const storedStats = await loadFile(plexStatsCachePath, {});
                const stats = storedStats?.version === PLEX_STATS_CACHE_VERSION
                    && String(storedStats?.serverIdentifier || '') === String(config.serverIdentifier)
                    ? storedStats
                    : { version: PLEX_STATS_CACHE_VERSION, serverIdentifier: config.serverIdentifier };
                let updated = false;

                if (currentStreams > (stats.maxConcurrentStreams || 0)) {
                    stats.maxConcurrentStreams = currentStreams;
                    updated = true;
                }
                if (currentDirect > (stats.maxDirectPlays || 0)) {
                    stats.maxDirectPlays = currentDirect;
                    updated = true;
                }
                if (currentTranscodes > (stats.maxTranscodes || 0)) {
                    stats.maxTranscodes = currentTranscodes;
                    updated = true;
                }

                if (updated) {
                    await saveFile(plexStatsCachePath, stats);
                }
            }
        } catch (e) {
            log(`[StreamMonitor] Cycle failed: ${e.message}`);
        } finally {
            monitorRunning = false;
        }
    }

    return {
        monitorConcurrentSessions,
    };
};
