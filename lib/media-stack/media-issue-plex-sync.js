import { randomUUID } from 'crypto';
import { getReadyArrInstances } from './arr-instances.js';
import {
    cleanText,
    PLEX_REPORTS_QUERY,
    PLEX_CREATE_COMMENT_MUTATION,
    plexRatingKeyFromUrl,
} from './media-issue-helpers.js';

export const createPlexIssueSync = ({ fetch, getPlexConnectionUri }) => {
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

    return { plexGraphql, resolvePlexTmdbId, fetchPlexIssues, PLEX_CREATE_COMMENT_MUTATION };
};

export const reconcileReplacement = async (config, issue, { fetch, resolveIntegrationUrlForFetch, plexGraphql, PLEX_CREATE_COMMENT_MUTATION }) => {
    if (issue.status !== 'open' || issue.remediationStatus !== 'replacing' || !issue.remediation?.instanceId) return issue;
    const instance = getReadyArrInstances(config, issue.remediation.type).find((item) => item.id === issue.remediation.instanceId);
    if (!instance) return issue;
    const baseUrl = await resolveIntegrationUrlForFetch(instance.url);
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

export const mergeSyncedIssues = async ({ localIssues, importedIssues, issuePath, saveFile, mergeExisting }) => {
    if (!importedIssues.length) return localIssues;
    const existingById = new Map(localIssues.map((issue) => [issue.id, issue]));
    const imported = importedIssues.map((issue) => {
        const existing = existingById.get(issue.id);
        return existing ? mergeExisting(issue, existing) : issue;
    });
    const importedIds = new Set(imported.map((issue) => issue.id));
    const merged = [...imported, ...localIssues.filter((issue) => !importedIds.has(issue.id))].slice(0, 2000);
    await saveFile(issuePath, merged);
    return merged;
};
