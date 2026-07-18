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
const PLEX_REPORT_COMMENTS_QUERY = `query reportComments($id: ID!, $first: PaginationInt) {
  reportComments(id: $id, first: $first) {
    nodes { id message date status user { id username displayName } }
  }
}`;
const PLEX_CREATE_COMMENT_MUTATION = `mutation createReportComment($input: CreateReportCommentInput!) {
  createReportComment(input: $input) { id message date status user { id username displayName } }
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
    commentCount: Math.max(0, (issue.comments?.length || 0) - 1),
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
    const ISSUE_SYNC_MIN_INTERVAL_MS = 60_000;
    let lastIssueSyncAt = 0;
    let issueSyncInFlight = null;
    const titleKey = (value) => cleanText(value, 300).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const normalizeComments = (comments = [], isAdmin = false) => comments.map((comment) => ({
        id: String(comment.id || randomUUID()),
        message: cleanText(comment.message),
        createdAt: comment.createdAt || comment.date || null,
        author: isAdmin ? cleanText(comment.author || comment.user?.displayName || comment.user?.username, 200) || null : null,
    }));

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

    app.get('/api/media-issues', requireAuth, requireMember, async (req, res) => {
        const config = await loadFile(configPath, {});
        const forceSync = req.query.sync === '1';
        const syncDue = forceSync || (Date.now() - lastIssueSyncAt >= ISSUE_SYNC_MIN_INTERVAL_MS);
        let localIssues = await loadIssues();
        let seerrConnected = false;
        let plexConnected = false;

        if (syncDue) {
            if (!issueSyncInFlight) {
                issueSyncInFlight = syncExternalIssues(config, req.query.filter || 'open')
                    .finally(() => { issueSyncInFlight = null; });
            }
            const synced = await issueSyncInFlight;
            localIssues = synced.localIssues;
            seerrConnected = synced.seerrConnected;
            plexConnected = synced.plexConnected;
            lastIssueSyncAt = Date.now();
        } else {
            // Cheap read path: report whether request/Plex integrations are configured without re-importing.
            seerrConnected = !!requestAppService.getRequestAppGate(config).ready;
            plexConnected = !!(config.plexToken && config.serverIdentifier);
        }

        const isAdmin = req.user?.isAdmin === true;
        const visibleLocal = localIssues.map((issue) => {
            const ownsPortalIssue = issue.source === 'portal' && issue.reporterId === reporterId(req.user);
            const canViewThread = isAdmin || ownsPortalIssue;
            const { comments, ...rest } = issue;
            const safeMessage = issue.source === 'portal' && !canViewThread
                ? ''
                : (issue.message || comments?.[0]?.message || '');
            return {
                ...rest,
                message: safeMessage,
                canComment: canViewThread,
                commentCount: issue.source === 'portal' ? (comments?.length || 0) : issue.commentCount || 0,
                // Never leak another member's conversation thread on the list endpoint.
                ...(canViewThread ? { comments: comments || [] } : {}),
                reporter: isAdmin ? issue.reporter : null,
                reporterId: undefined,
            };
        });
        const issues = visibleLocal.map((issue) => issue.source === 'seerr' && !isAdmin ? { ...issue, message: memberSafeMessage(issue.message) } : issue)
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

    app.get('/api/media-issues/:issueId/comments', requireAuth, requireMember, async (req, res) => {
        const isAdmin = req.user?.isAdmin === true;
        const config = await loadFile(configPath, {});
        if (req.params.issueId.startsWith('seerr:')) {
            if (!isAdmin) return res.status(403).json({ error: 'Only an admin can view imported request-service issue comments.' });
            const issue = await requestAppService.getIssue(config, req.params.issueId.slice(6));
            return res.json({ comments: normalizeComments((issue?.comments || []).slice(1), isAdmin) });
        }
        const issues = await loadIssues();
        const issue = issues.find((item) => item.id === req.params.issueId);
        if (!issue) return res.status(404).json({ error: 'Issue not found.' });
        const ownsPortalIssue = issue.source === 'portal' && issue.reporterId === reporterId(req.user);
        if (!isAdmin && !ownsPortalIssue) {
            return res.status(403).json({ error: 'You cannot view comments on this issue.' });
        }
        if (issue.source === 'plex') {
            const data = await plexGraphql(config, PLEX_REPORT_COMMENTS_QUERY, { id: issue.sourceId, first: 100 });
            return res.json({ comments: normalizeComments(data?.reportComments?.nodes || [], isAdmin) });
        }
        return res.json({ comments: normalizeComments(issue.comments || [], isAdmin) });
    });

    app.post('/api/media-issues/:issueId/comments', requireAuth, requireMember, async (req, res) => {
        if (blockIfImpersonating(req, res)) return;
        const message = cleanText(req.body?.message);
        if (message.length < 2) return res.status(400).json({ error: 'Comment is required.' });
        const isAdmin = req.user?.isAdmin === true;
        const config = await loadFile(configPath, {});
        if (req.params.issueId.startsWith('seerr:')) {
            if (!isAdmin) return res.status(403).json({ error: 'Only an admin can reply to imported request-service issues.' });
            const result = await requestAppService.commentOnIssue(config, req.params.issueId.slice(6), message);
            return res.status(201).json({ success: true, result });
        }
        const issues = await loadIssues();
        const index = issues.findIndex((item) => item.id === req.params.issueId);
        if (index < 0) return res.status(404).json({ error: 'Issue not found.' });
        const issue = issues[index];
        const ownsPortalIssue = issue.source === 'portal' && issue.reporterId === reporterId(req.user);
        if (!isAdmin && !ownsPortalIssue) return res.status(403).json({ error: 'You cannot reply to this issue.' });
        if (issue.source === 'plex') {
            const result = await plexGraphql(config, PLEX_CREATE_COMMENT_MUTATION, { input: { message, report: issue.sourceId } });
            return res.status(201).json({ success: true, comment: normalizeComments([result?.createReportComment], isAdmin)[0] });
        }
        const now = new Date().toISOString();
        const comment = { id: randomUUID(), message, createdAt: now, author: cleanText(req.user?.username || req.user?.email, 200) || 'Portal user' };
        issues[index] = { ...issue, comments: [...(issue.comments || []), comment], updatedAt: now };
        await saveFile(issuePath, issues);
        res.status(201).json({ success: true, comment: normalizeComments([comment], isAdmin)[0] });
    });

    app.post('/api/media-issues/:issueId/approve-search', requireAdmin, async (req, res) => {
        const issues = await loadIssues();
        const index = issues.findIndex((issue) => issue.id === req.params.issueId);
        if (index < 0) return res.status(404).json({ error: 'Issue not found.' });
        if (issues[index].status !== 'open' || !['pending-review', 'approved-unmatched'].includes(issues[index].remediationStatus)) {
            return res.status(409).json({ error: 'This issue has already been approved or resolved.' });
        }
        const config = await loadFile(configPath, {});
        let search;
        try {
            search = await findAndSearch(config, issues[index]);
        } catch (error) {
            return res.status(502).json({ error: error.message || 'Automation search failed.' });
        }
        issues[index] = {
            ...issues[index],
            remediationStatus: search.queued ? (search.replacementGrabbed ? 'replacing' : 'searching') : 'approved-unmatched',
            remediation: search,
            approvedAt: new Date().toISOString(),
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
