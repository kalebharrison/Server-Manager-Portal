import { randomUUID } from 'crypto';
import { blockIfImpersonating } from './impersonation.js';
import { getReadyArrInstances } from './arr-instances.js';

const cleanText = (value, max = 2000) => String(value || '').trim().slice(0, max);
const reporterId = (user = {}) => String(user.id || user.plexAccountId || user.email || user.username || 'unknown');
const memberSafeMessage = (value) => String(value || '').replace(/^Reported from Server Manager Portal by[^\n]*\n+/i, '').trim();
const safeAssetPath = (value) => {
    const path = cleanText(value, 1000);
    return path.startsWith('/') && !path.startsWith('//') ? path : null;
};
const PLEX_REPORTS_QUERY = `query getReportedIssues($first: PaginationInt!, $after: String) {
  reports(after: $after, first: $first) {
    nodes { id message user { id username displayName } url date commentCount }
    pageInfo { hasNextPage endCursor }
  }
}`;

const normalizeSeerrIssue = (issue) => ({
    id: `seerr:${issue.id}`,
    source: 'seerr',
    sourceId: String(issue.id),
    status: Number(issue.status) === 2 ? 'resolved' : 'open',
    issueType: Number(issue.issueType) || 4,
    title: issue.media?.title || issue.media?.name || 'Media issue',
    mediaType: issue.media?.mediaType || 'media',
    tmdbId: issue.media?.tmdbId || null,
    posterPath: issue.media?.posterPath || null,
    message: issue.comments?.[0]?.message || '',
    createdAt: issue.createdAt || null,
    updatedAt: issue.updatedAt || issue.createdAt || null,
    reporter: issue.createdBy?.displayName || issue.createdBy?.username || null,
});

export const registerMediaIssueRoutes = ({
    app,
    requireAuth,
    requireMember,
    requireAdmin,
    configPath,
    issuePath,
    loadFile,
    saveFile,
    requestAppService,
    fetch,
    resolveIntegrationUrlForFetch,
    getPlexConnectionUri,
    appendAuditLog,
    log,
}) => {
    const loadIssues = () => loadFile(issuePath, []);
    const titleKey = (value) => cleanText(value, 300).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

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
                const command = type === 'radarr'
                    ? { name: 'MoviesSearch', movieIds: [match.id] }
                    : { name: 'SeriesSearch', seriesId: match.id };
                const commandResponse = await fetch(`${baseUrl}/api/v3/command`, { method: 'POST', headers, body: JSON.stringify(command) });
                if (!commandResponse.ok) throw new Error(`${type} search failed (${commandResponse.status})`);
                const result = await commandResponse.json().catch(() => ({}));
                return { queued: true, type, instanceId: instance.id, entityId: match.id, commandId: result.id || null };
            }
        }
        return { queued: false, reason: 'No matching TV or movie automation record was found.' };
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

    const plexRatingKeyFromUrl = (value) => {
        let decoded = String(value || '');
        for (let attempt = 0; attempt < 3; attempt++) {
            const match = decoded.match(/\/library\/metadata\/(\d+)/i);
            if (match) return match[1];
            try {
                const next = decodeURIComponent(decoded);
                if (next === decoded) break;
                decoded = next;
            } catch {
                break;
            }
        }
        return null;
    };

    const fetchPlexIssues = async (config) => {
        if (!config.plexToken) return { connected: false, issues: [] };
        const response = await fetch('https://community.plex.tv/api', {
            method: 'POST',
            signal: AbortSignal.timeout(5000),
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
                'X-Plex-Token': config.plexToken,
                'X-Plex-Client-Identifier': 'server-manager-portal',
            },
            body: JSON.stringify({ query: PLEX_REPORTS_QUERY, variables: { first: 50, after: null } }),
        });
        if (!response.ok) throw new Error(`Plex reports request failed (${response.status})`);
        const payload = await response.json();
        if (payload?.errors?.length) throw new Error(payload.errors[0]?.message || 'Plex reports request failed');
        const nodes = payload?.data?.reports?.nodes || [];
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

    app.get('/api/media-issues', requireAuth, requireMember, async (req, res) => {
        const config = await loadFile(configPath, {});
        let localIssues = await loadIssues();
        let seerrIssues = [];
        let seerrConnected = false;
        let plexConnected = false;
        const [seerrResult, plexResult] = await Promise.allSettled([
            requestAppService.getRequestAppGate(config).ready
                ? requestAppService.listIssues(config, { filter: req.query.filter || 'open' })
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

        const isAdmin = req.user?.isAdmin === true;
        const visibleLocal = localIssues.map((issue) => ({
            ...issue,
            reporter: isAdmin ? issue.reporter : null,
            reporterId: undefined,
        }));
        const visibleSeerr = seerrIssues.map((issue) => ({
            ...issue,
            reporter: isAdmin ? issue.reporter : null,
            message: isAdmin ? issue.message : memberSafeMessage(issue.message),
        }));
        const issues = [...visibleLocal, ...visibleSeerr]
            .filter((issue) => req.query.filter === 'all' || issue.status === (req.query.filter || 'open'))
            .sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime());
        res.json({ issues, sources: { portal: true, seerr: seerrConnected, plex: plexConnected } });
    });

    app.post('/api/media-issues', requireAuth, requireMember, async (req, res) => {
        if (blockIfImpersonating(req, res)) return;
        const message = cleanText(req.body?.message);
        const title = cleanText(req.body?.title, 300);
        if (message.length < 3 || !title) return res.status(400).json({ error: 'Title and issue description are required.' });

        const issues = await loadIssues();
        const now = new Date().toISOString();
        const issue = {
            id: `portal:${randomUUID()}`,
            source: 'portal',
            status: 'open',
            remediationStatus: 'pending-review',
            issueType: Math.max(1, Math.min(4, Number(req.body?.issueType) || 4)),
            title,
            mediaType: ['movie', 'show'].includes(req.body?.mediaType) ? req.body.mediaType : 'media',
            ratingKey: cleanText(req.body?.ratingKey, 100) || null,
            tmdbId: Number(req.body?.tmdbId) || null,
            thumbUrl: safeAssetPath(req.body?.thumbUrl),
            message,
            reporter: cleanText(req.user?.username || req.user?.email, 200) || 'Portal user',
            reporterId: reporterId(req.user),
            createdAt: now,
            updatedAt: now,
        };
        await saveFile(issuePath, [issue, ...issues].slice(0, 2000));
        await appendAuditLog('media_issue_reported', req.user, null, { issueId: issue.id, title: issue.title });
        res.status(201).json({ issue: { ...issue, reporterId: undefined } });
    });

    app.post('/api/media-issues/:issueId/approve-search', requireAdmin, async (req, res) => {
        const issues = await loadIssues();
        const index = issues.findIndex((issue) => issue.id === req.params.issueId);
        if (index < 0) return res.status(404).json({ error: 'Issue not found.' });
        const config = await loadFile(configPath, {});
        let search;
        try {
            search = await findAndSearch(config, issues[index]);
        } catch (error) {
            return res.status(502).json({ error: error.message || 'Automation search failed.' });
        }
        issues[index] = {
            ...issues[index],
            remediationStatus: search.queued ? 'searching' : 'approved-unmatched',
            remediation: search,
            updatedAt: new Date().toISOString(),
        };
        await saveFile(issuePath, issues);
        await appendAuditLog('media_issue_search_approved', req.user, null, { issueId: issues[index].id, title: issues[index].title });
        res.json({ issue: { ...issues[index], reporterId: undefined }, ...search });
    });

    app.post('/api/media-issues/:issueId/send-to-seerr', requireAdmin, async (req, res) => {
        const issues = await loadIssues();
        const index = issues.findIndex((issue) => issue.id === req.params.issueId);
        if (index < 0) return res.status(404).json({ error: 'Issue not found.' });
        const config = await loadFile(configPath, {});
        if (!requestAppService.getRequestAppGate(config).ready) return res.status(409).json({ error: 'Request service is not configured.' });
        const tmdbId = await resolvePlexTmdbId(config, issues[index]);
        if (!tmdbId) return res.status(409).json({ error: 'This Plex item could not be matched to a TMDB record.' });
        const mediaType = issues[index].mediaType === 'show' ? 'tv' : 'movie';
        const detail = await requestAppService.getMediaDetails(config, { mediaType, tmdbId });
        if (!detail?.mediaId) return res.status(409).json({ error: 'This title is not tracked by the request service.' });
        const result = await requestAppService.reportIssue(config, {
            mediaId: detail.mediaId,
            issueType: issues[index].issueType,
            message: issues[index].message,
            sessionUser: req.user,
        });
        issues[index] = {
            ...issues[index],
            tmdbId,
            seerrIssueId: result?.id || null,
            syncedToSeerrAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };
        await saveFile(issuePath, issues);
        await appendAuditLog('media_issue_sent_to_seerr', req.user, null, { issueId: issues[index].id, title: issues[index].title, seerrIssueId: result?.id || null });
        res.json({ success: true, issue: { ...issues[index], reporterId: undefined } });
    });

    app.post('/api/media-issues/:issueId/resolve', requireAdmin, async (req, res) => {
        if (req.params.issueId.startsWith('seerr:')) {
            const config = await loadFile(configPath, {});
            const result = await requestAppService.updateIssueStatus(config, req.params.issueId.slice(6), 'resolved');
            return res.json({ success: true, result });
        }
        const issues = await loadIssues();
        const index = issues.findIndex((issue) => issue.id === req.params.issueId);
        if (index < 0) return res.status(404).json({ error: 'Issue not found.' });
        issues[index] = { ...issues[index], status: 'resolved', updatedAt: new Date().toISOString() };
        await saveFile(issuePath, issues);
        res.json({ success: true });
    });
};
