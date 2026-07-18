import { normalizePlexBandwidthKbps } from '../plex/plex-bandwidth.js';
import { PLEX_STATS_CACHE_VERSION } from '../plex/plex-stats-service.js';

function normalizeRuleResolution(rawResolution, isTranscoding, transcodeResolutionRaw) {
    const normalizeBucket = (value) => {
        const text = String(value || '').toLowerCase().trim();
        if (!text) return '';
        if (text.includes('4k') || text.includes('2160')) return '4k';
        if (text.includes('1440')) return '1440';
        if (text.includes('1080')) return '1080';
        if (text.includes('720')) return '720';
        if (text.includes('576')) return '576';
        if (text.includes('480')) return '480';
        if (text.includes('sd')) return 'sd';
        return text;
    };
    if (isTranscoding) {
        const hinted = normalizeBucket(transcodeResolutionRaw);
        if (hinted) return hinted;
        // Conservative behavior: never infer transcode output resolution from source metadata.
        // If output resolution is unknown, strict resolution rules should not match.
        return 'unknown';
    }
    return normalizeBucket(rawResolution);
}

function sessionMatchesCondition(session, condition) {
    const { field, operator, value } = condition;
    let sessionVal;

    switch (field) {
        case 'isTranscoding': sessionVal = session.isTranscoding ? 'true' : 'false'; break;
        case 'videoResolution': sessionVal = (session.resolution || '').toString().toLowerCase(); break;
        case 'user': sessionVal = (session.user || '').toLowerCase(); break;
        case 'bandwidth': sessionVal = Math.round((session.bandwidth || 0) / 1000); break; // in Mbps
        case 'playerProduct': sessionVal = (session.playerProduct || '').toLowerCase(); break;
        case 'state': sessionVal = (session.state || '').toLowerCase(); break;
        case 'mediaType': sessionVal = (session.type || '').toLowerCase(); break;
        case 'sessionLocation': sessionVal = (session.sessionLocation || '').toLowerCase(); break;
        case 'playerTitle': sessionVal = (session.playerTitle || '').toLowerCase(); break;
        case 'videoCodec': sessionVal = (session.videoCodec || '').toLowerCase(); break;
        case 'audioCodec': sessionVal = (session.audioCodec || '').toLowerCase(); break;
        case 'transcodeVideoDecision': sessionVal = (session.transcodeVideoDecision || '').toLowerCase(); break;
        default: return false;
    }

    const compareVal = field === 'bandwidth' ? parseFloat(value) : (value || '').toString().toLowerCase();

    switch (operator) {
        case 'equals': return String(sessionVal) === String(compareVal);
        case 'not_equals': return String(sessionVal) !== String(compareVal);
        case 'contains': return String(sessionVal).includes(String(compareVal));
        case 'not_contains': return !String(sessionVal).includes(String(compareVal));
        case 'greater_than': return parseFloat(sessionVal) > parseFloat(compareVal);
        case 'less_than': return parseFloat(sessionVal) < parseFloat(compareVal);
        default: return false;
    }
}

// --- Security: Schema validation for kill rules ---
const VALID_KILL_RULE_FIELDS    = new Set(['isTranscoding', 'videoResolution', 'user', 'bandwidth', 'playerProduct', 'state', 'mediaType', 'sessionLocation', 'playerTitle', 'videoCodec', 'audioCodec', 'transcodeVideoDecision']);
const VALID_KILL_RULE_OPERATORS = new Set(['equals', 'not_equals', 'contains', 'not_contains', 'greater_than', 'less_than']);

export const validateKillRulesSchema = (rules) => {
    if (!Array.isArray(rules)) throw new Error('Rules must be an array');
    for (const rule of rules) {
        if (typeof rule !== 'object' || rule === null) throw new Error('Each rule must be an object');
        if (!Array.isArray(rule.conditions))           throw new Error(`Rule "${rule.name || 'unnamed'}": conditions must be an array`);
        if (rule.conditionLogic && !['AND', 'OR'].includes(String(rule.conditionLogic))) {
            throw new Error(`Rule "${rule.name || 'unnamed'}": invalid conditionLogic "${rule.conditionLogic}"`);
        }
        if (rule.killMessage && String(rule.killMessage).length > 500) {
            throw new Error(`Rule "${rule.name || 'unnamed'}": killMessage exceeds 500 characters`);
        }
        for (const cond of rule.conditions) {
            if (!cond || typeof cond !== 'object') throw new Error('Each condition must be an object');
            if (!VALID_KILL_RULE_FIELDS.has(cond.field))       throw new Error(`Invalid condition field: "${cond.field}"`);
            if (!VALID_KILL_RULE_OPERATORS.has(cond.operator)) throw new Error(`Invalid condition operator: "${cond.operator}"`);
        }
    }
};

export const createStreamMonitor = ({
    configPath,
    killRulesPath,
    plexStatsCachePath,
    loadFile,
    saveFile,
    getPlexConnectionUri,
    fetchWithTimeout,
    appendAuditLog,
    log,
}) => {
    let monitorRunning = false;
    async function evaluateKillRules(config, uri, sessions) {
        if (!sessions || sessions.length === 0) return;
        const rules = await loadFile(killRulesPath, []);
        const enabledRules = rules.filter(r => r.enabled !== false);
        if (enabledRules.length === 0) return;

        for (const session of sessions) {
            for (const rule of enabledRules) {
                const { conditions, conditionLogic = 'AND', killMessage, name } = rule;
                if (!conditions || conditions.length === 0) continue;

                let matched;
                if (conditionLogic === 'OR') {
                    matched = conditions.some(c => sessionMatchesCondition(session, c));
                } else {
                    matched = conditions.every(c => sessionMatchesCondition(session, c));
                }

                if (matched && session.sessionId) {
                    const msg = killMessage || `Your stream has been stopped by the server administrator (Rule: ${name || 'Unnamed'}).`;
                    try {
                        const killRes = await fetchWithTimeout(`${uri}/status/sessions/terminate?sessionId=${encodeURIComponent(session.sessionId)}&reason=${encodeURIComponent(msg)}&X-Plex-Token=${config.plexToken}`, {
                            method: 'GET', headers: { 'Accept': 'application/json' }
                        }, 10000);
                        if (killRes.ok || killRes.status === 204) {
                            log(`[KillRules] Terminated session for "${session.user || 'Unknown'}" via rule "${name || 'Unnamed'}". Reason: ${msg}`);
                            await appendAuditLog('stream_killed_by_rule', null, null, { user: session.user, rule: name, reason: msg });
                        }
                    } catch (e) {
                        log(`[KillRules] Error terminating session: ${e.message}`);
                    }
                    break; // One rule match per session is enough
                }
            }
        }
    }

    // Monitor Plex sessions to track high watermarks
    async function monitorConcurrentSessions() {
        if (monitorRunning) return;
        monitorRunning = true;
        try {
            const config = await loadFile(configPath, null);
            if (!config || !config.plexToken || !config.serverIdentifier) return;

            const uri = await getPlexConnectionUri(config);
            if (!uri) return;

            const sessionsRes = await fetchWithTimeout(`${uri}/status/sessions?X-Plex-Token=${config.plexToken}`, { headers: { 'Accept': 'application/json' } }, 10000).then(r => r.ok ? r.json() : null).catch(() => null);

            if (sessionsRes && sessionsRes.MediaContainer) {
                const currentStreams = sessionsRes.MediaContainer.size || 0;

                // Evaluate kill rules against live sessions
                if (sessionsRes.MediaContainer.Metadata) {
                    const sessionObjs = sessionsRes.MediaContainer.Metadata.map(m => {
                        const isTranscode = !!(m.TranscodeSession || (m.Media && m.Media[0] && m.Media[0].Part && m.Media[0].Part[0] && m.Media[0].Part[0].Stream && m.Media[0].Part[0].Stream.some(s => s.decision === 'transcode')));
                        const player = m.Player || {};
                        const session = m.Session || {};
                        const transcodeResolutionRaw = m?.TranscodeSession?.videoResolution || '';
                        const sourceResolution = m.Media && m.Media[0] ? m.Media[0].videoResolution : null;
                        return {
                            sessionId: session.id || m.sessionKey,
                            user: m.User ? m.User.title : 'Unknown',
                            isTranscoding: isTranscode,
                            sourceResolution: sourceResolution ? String(sourceResolution).toLowerCase() : null,
                            resolution: normalizeRuleResolution(sourceResolution, isTranscode, transcodeResolutionRaw),
                            bandwidth: normalizePlexBandwidthKbps((session && session.bandwidth) || (m.Media && m.Media[0] && m.Media[0].bitrate) || 0),
                            playerProduct: player.product || '',
                            playerTitle: player.title || '',
                            state: player.state || 'playing',
                            type: m.type || '',
                            sessionLocation: session.location || 'lan',
                            videoCodec: m.Media && m.Media[0] ? m.Media[0].videoCodec : '',
                            audioCodec: m.Media && m.Media[0] ? m.Media[0].audioCodec : '',
                            transcodeVideoDecision: m.TranscodeSession ? m.TranscodeSession.videoDecision : 'directplay',
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
