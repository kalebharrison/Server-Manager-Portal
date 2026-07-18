import { randomUUID } from 'crypto';
import { getReadyArrInstances } from './arr-instances.js';
import {
    cleanText,
    PLEX_REPORTS_QUERY,
    PLEX_CREATE_COMMENT_MUTATION,
    normalizeSeerrIssue,
    titleKey,
    plexRatingKeyFromUrl,
} from './media-issue-helpers.js';

export const createMediaIssueSync = ({
    issuePath,
    loadFile,
    saveFile,
    requestAppService,
    fetch,
    resolveIntegrationUrlForFetch,
    getPlexConnectionUri,
    log = () => {},
}) => {
    const loadIssues = () => loadFile(issuePath, []);

    const findAndSearch = async (config, issue) => {
        const types = issue.mediaType === 'movie' ? ['radarr'] : issue.mediaType === 'show' ? ['sonarr'] : ['radarr', 'sonarr'];
        for (const type of types) {
            for (const instance of getReadyArrInstances(config, type)) {
                const baseUrl = resolveIntegrationUrlForFetch(instance.url);
                const headers = { 'X-Api-Key': instance.apiKey, Accept: 'application/json', 'Content-Type': 'application/json' };
                const entityName = type === 'radarr' ? 'movie' : 'series';
                const catalogResponse = await fetch(`${baseUrl}/api/v3/${entityName}`, { headers });
                if (!catalogResponse.ok) continue;
                const catalog = await catalogResponse.json();
                const match = (Array.isArray(catalog) ? catalog : []).find((item) => (
                    (issue.tmdbId && Number(item.tmdbId) === Number(issue.tmdbId))
                    || titleKey(item.title) === titleKey(issue.title)
                ));
                if (!match?.id) continue;
                let releaseEndpoint = type === 'radarr' ? `/api/v3/release?movieId=${encodeURIComponent(match.id)}` : null;
                let episodeId = null;
                if (type === 'sonarr' && issue.seasonNumber !== null && issue.seasonNumber !== undefined && issue.episodeNumber) {
                    const episodeResponse = await fetch(`${baseUrl}/api/v3/episode?seriesId=${encodeURIComponent(match.id)}`, { headers });
                    if (episodeResponse.ok) {
                        const episodes = await episodeResponse.json();
                        const episode = (Array.isArray(episodes) ? episodes : []).find((item) => Number(item.seasonNumber) === Number(issue.seasonNumber) && Number(item.episodeNumber) === Number(issue.episodeNumber));
                        if (episode?.id) {
                            episodeId = episode.id;
                            releaseEndpoint = `/api/v3/release?episodeId=${encodeURIComponent(episode.id)}`;
                        }
                    }
                }
                if (releaseEndpoint) {
                    const releasesResponse = await fetch(`${baseUrl}${releaseEndpoint}`, { headers });
                    if (!releasesResponse.ok) throw new Error(`${type} release search failed (${releasesResponse.status})`);
                    const releases = await releasesResponse.json();
                    const candidate = (Array.isArray(releases) ? releases : []).find((release) => release.rejected !== true && release.downloadAllowed !== false);
                    if (!candidate) return { queued: false, reason: 'No acceptable replacement release was found.', type, instanceId: instance.id, entityId: match.id };
                    const grabResponse = await fetch(`${baseUrl}/api/v3/release`, { method: 'POST', headers, body: JSON.stringify(candidate) });
                    if (!grabResponse.ok) throw new Error(`${type} replacement grab failed (${grabResponse.status})`);
                    const result = await grabResponse.json().catch(() => ({}));
                    return {
                        queued: true,
                        replacementGrabbed: true,
                        type,
                        instanceId: instance.id,
                        entityId: match.id,
                        episodeId,
                        commandId: result.id || null,
                        quality: candidate.quality?.quality?.name || candidate.quality?.name || null,
                    };
                }
                const commandResponse = await fetch(`${baseUrl}/api/v3/command`, { method: 'POST', headers, body: JSON.stringify({ name: 'SeriesSearch', seriesId: match.id }) });
                if (!commandResponse.ok) throw new Error(`sonarr search failed (${commandResponse.status})`);
                const result = await commandResponse.json().catch(() => ({}));
                return { queued: true, replacementGrabbed: false, type, instanceId: instance.id, entityId: match.id, commandId: result.id || null };
            }
        }
        return { queued: false, reason: 'No matching TV or movie automation record was found.' };
    };

    const plexGraphql = async (config, query, variables) => {
        const response = await fetch('https://community.plex.tv/api', {
            method: 'POST',
            signal: AbortSignal.timeout(5000),
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
                'X-Plex-Token': config.plexToken,
                'X-Plex-Client-Identifier': 'server-manager-portal',
            },
            body: JSON.stringify({ query, variables }),
        });
        if (!response.ok) throw new Error(`Plex community request failed (${response.status})`);
        const payload = await response.json();
        if (payload?.errors?.length) throw new Error(payload.errors[0]?.message || 'Plex community request failed');
        return payload.data;
    };

    const reconcileReplacement = async (config, issue) => {
        if (issue.status !== 'open' || issue.remediationStatus !== 'replacing' || !issue.remediation?.instanceId) return issue;
        const instance = getReadyArrInstances(config, issue.remediation.type).find((item) => item.id === issue.remediation.instanceId);
        if (!instance) return issue;
        const baseUrl = resolveIntegrationUrlForFetch(instance.url);
        const headers = { 'X-Api-Key': instance.apiKey, Accept: 'application/json' };
        const response = await fetch(`${baseUrl}/api/v3/history?page=1&pageSize=100&sortKey=date&sortDirection=descending&includeMovie=true&includeSeries=true`, { headers });
        if (!response.ok) return issue;
        const records = (await response.json())?.records || [];
        const approvedAt = new Date(issue.approvedAt || 0).getTime();
        const imported = records.find((record) => {
            if (!String(record.eventType || '').toLowerCase().includes('import')) return false;
            if (new Date(record.date || 0).getTime() < approvedAt) return false;
            if (issue.remediation.type === 'radarr') return Number(record.movieId) === Number(issue.remediation.entityId);
            if (issue.remediation.episodeId) return Number(record.episodeId) === Number(issue.remediation.episodeId);
            return Number(record.seriesId) === Number(issue.remediation.entityId);
        });
        if (!imported) return issue;

        const message = 'A replacement was downloaded and imported successfully. This issue has been resolved automatically.';
        if (issue.source === 'plex') {
            await plexGraphql(config, PLEX_CREATE_COMMENT_MUTATION, { input: { message, report: issue.sourceId } });
        } else if (issue.source === 'seerr') {
            await requestAppService.commentOnIssue(config, issue.sourceId, message);
            await requestAppService.updateIssueStatus(config, issue.sourceId, 'resolved');
        }
        const now = new Date().toISOString();
        return {
            ...issue,
            status: 'resolved',
            remediationStatus: 'resolved',
            resolvedAt: now,
            updatedAt: now,
            comments: issue.source === 'portal'
                ? [...(issue.comments || []), { id: randomUUID(), message, createdAt: now, author: 'Server Portal' }]
                : issue.comments,
        };
    };

    const resolvePlexTmdbId = async (config, issue) => {
        if (issue.tmdbId) return Number(issue.tmdbId);
        const ratingKey = String(issue.ratingKey || '').match(/\d+/)?.[0];
        if (!ratingKey || !config.plexToken) return null;
        const uri = await getPlexConnectionUri(config);
        if (!uri) return null;
        const response = await fetch(`${uri}/library/metadata/${encodeURIComponent(ratingKey)}?includeGuids=1&X-Plex-Token=${encodeURIComponent(config.plexToken)}`, { headers: { Accept: 'application/json' } });
        if (!response.ok) return null;
        const metadata = (await response.json())?.MediaContainer?.Metadata?.[0];
        const guids = Array.isArray(metadata?.Guid) ? metadata.Guid : [];
        const tmdb = guids.map((guid) => String(guid?.id || '')).find((id) => id.startsWith('tmdb://'));
        return tmdb ? Number(tmdb.slice(7)) || null : null;
    };

    const fetchPlexIssues = async (config) => {
        if (!config.plexToken) return { connected: false, issues: [] };
        const payload = await plexGraphql(config, PLEX_REPORTS_QUERY, { first: 50, after: null });
        const nodes = payload?.reports?.nodes || [];
        const uri = await getPlexConnectionUri(config).catch(() => null);
        return {
            connected: true,
            issues: await Promise.all(nodes.map(async (report) => {
                const ratingKey = plexRatingKeyFromUrl(report.url);
                let metadata = null;
                if (uri && ratingKey) {
                    metadata = await fetch(`${uri}/library/metadata/${encodeURIComponent(ratingKey)}?X-Plex-Token=${encodeURIComponent(config.plexToken)}`, { headers: { Accept: 'application/json' } })
                        .then((result) => result.ok ? result.json() : null)
                        .then((result) => result?.MediaContainer?.Metadata?.[0] || null)
                        .catch(() => null);
                }
                const mediaType = metadata?.type === 'movie' ? 'movie' : ['show', 'season', 'episode'].includes(metadata?.type) ? 'show' : 'media';
                return {
                    id: `plex:${report.id}`,
                    source: 'plex',
                    sourceId: String(report.id),
                    status: 'open',
                    remediationStatus: 'pending-review',
                    issueType: 4,
                    title: metadata?.grandparentTitle || metadata?.parentTitle || metadata?.title || 'Unknown Plex item',
                    subtitle: metadata?.type === 'episode'
                        ? `S${String(metadata.parentIndex || 0).padStart(2, '0')}E${String(metadata.index || 0).padStart(2, '0')}${metadata.title ? ` - ${metadata.title}` : ''}`
                        : null,
                    seasonNumber: metadata?.type === 'episode' ? Number(metadata.parentIndex) : null,
                    episodeNumber: metadata?.type === 'episode' ? Number(metadata.index) : null,
                    year: Number(metadata?.year || metadata?.grandparentYear) || null,
                    mediaType,
                    ratingKey,
                    thumbUrl: metadata?.grandparentThumb || metadata?.parentThumb || metadata?.thumb
                        ? `/api/plex/image?path=${encodeURIComponent(metadata.grandparentThumb || metadata.parentThumb || metadata.thumb)}`
                        : null,
                    message: cleanText(report.message),
                    reporter: cleanText(report.user?.displayName || report.user?.username, 200) || 'Plex user',
                    reporterId: String(report.user?.id || 'unknown'),
                    createdAt: report.date || null,
                    updatedAt: report.date || null,
                    commentCount: Number(report.commentCount) || 0,
                    plexUrl: cleanText(report.url, 1000),
                };
            })),
        };
    };

    const syncExternalIssues = async (config, filter) => {
        let localIssues = await loadIssues();
        let seerrIssues = [];
        let seerrConnected = false;
        let plexConnected = false;
        const [seerrResult, plexResult] = await Promise.allSettled([
            requestAppService.getRequestAppGate(config).ready
                ? requestAppService.listIssues(config, { filter })
                : Promise.resolve(null),
            fetchPlexIssues(config),
        ]);
        if (seerrResult.status === 'fulfilled' && seerrResult.value) {
            seerrIssues = (seerrResult.value?.results || []).map(normalizeSeerrIssue);
            seerrConnected = true;
        } else if (seerrResult.status === 'rejected') log(`Seerr issue sync failed: ${seerrResult.reason?.message}`);
        if (plexResult.status === 'fulfilled') {
            plexConnected = plexResult.value.connected;
            if (plexResult.value.issues.length) {
                const existingById = new Map(localIssues.map((issue) => [issue.id, issue]));
                const imported = plexResult.value.issues.map((issue) => {
                    const existing = existingById.get(issue.id);
                    return existing ? {
                        ...issue,
                        status: existing.status,
                        remediationStatus: existing.remediationStatus,
                        remediation: existing.remediation,
                        tmdbId: existing.tmdbId,
                        seerrIssueId: existing.seerrIssueId,
                        syncedToSeerrAt: existing.syncedToSeerrAt,
                    } : issue;
                });
                const importedIds = new Set(imported.map((issue) => issue.id));
                localIssues = [...imported, ...localIssues.filter((issue) => !importedIds.has(issue.id))].slice(0, 2000);
                await saveFile(issuePath, localIssues);
            }
        } else log(`Plex issue sync failed: ${plexResult.reason?.message}`);

        if (seerrIssues.length) {
            const existingById = new Map(localIssues.map((issue) => [issue.id, issue]));
            const imported = seerrIssues.map((issue) => {
                const existing = existingById.get(issue.id);
                return existing ? {
                    ...issue,
                    remediationStatus: existing.remediationStatus || 'pending-review',
                    remediation: existing.remediation,
                    approvedAt: existing.approvedAt,
                } : { ...issue, remediationStatus: 'pending-review' };
            });
            const importedIds = new Set(imported.map((issue) => issue.id));
            localIssues = [...imported, ...localIssues.filter((issue) => !importedIds.has(issue.id))].slice(0, 2000);
            await saveFile(issuePath, localIssues);
        }

        let reconciliationChanged = false;
        for (let index = 0; index < localIssues.length; index++) {
            try {
                const reconciled = await reconcileReplacement(config, localIssues[index]);
                if (reconciled !== localIssues[index]) {
                    localIssues[index] = reconciled;
                    reconciliationChanged = true;
                }
            } catch (error) {
                log(`Issue replacement reconciliation failed for ${localIssues[index].id}: ${error.message}`);
            }
        }
        if (reconciliationChanged) await saveFile(issuePath, localIssues);
        return { localIssues, seerrConnected, plexConnected };
    };

    return {
        loadIssues,
        findAndSearch,
        plexGraphql,
        reconcileReplacement,
        resolvePlexTmdbId,
        fetchPlexIssues,
        syncExternalIssues,
    };
};
