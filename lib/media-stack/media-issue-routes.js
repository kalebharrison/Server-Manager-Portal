import { randomUUID } from 'crypto';
import { blockIfImpersonating } from '../auth/impersonation.js';
import {
    cleanText,
    reporterId,
    memberSafeMessage,
    safeAssetPath,
    PLEX_REPORT_COMMENTS_QUERY,
    normalizeComments,
} from './media-issue-helpers.js';
import { createMediaIssueSync } from './media-issue-sync.js';

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
    notifyIssueReply = null,
    log,
}) => {
    const ISSUE_SYNC_MIN_INTERVAL_MS = 60_000;
    let lastIssueSyncAt = 0;
    let issueSyncInFlight = null;

    const {
        loadIssues,
        findAndSearch,
        plexGraphql,
        resolvePlexTmdbId,
        syncExternalIssues,
    } = createMediaIssueSync({
        issuePath,
        loadFile,
        saveFile,
        requestAppService,
        fetch,
        resolveIntegrationUrlForFetch,
        getPlexConnectionUri,
        log,
    });

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
        if (isAdmin && notifyIssueReply && issue.source === 'portal') {
            const configForMail = await loadFile(configPath, {});
            void notifyIssueReply(configForMail, { issue: issues[index], replyAuthor: comment.author });
        }
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
