import { randomUUID } from 'crypto';
import { blockIfImpersonating } from '../auth/impersonation.js';
import {
    cleanText,
    reporterId,
    memberSafeMessage,
    safeAssetPath,
    PLEX_REPORT_COMMENTS_QUERY,
    PLEX_CREATE_COMMENT_MUTATION,
    normalizeComments,
} from './media-issue-helpers.js';

export const registerMediaIssueMemberRoutes = ({
    app,
    requireAuth,
    requireMember,
    memberApiRateLimit = null,
    configPath,
    issuePath,
    loadFile,
    saveFile,
    requestAppService,
    loadIssues,
    plexGraphql,
    syncExternalIssues,
    appendAuditLog,
    notifyIssueReply = null,
}) => {
    const ISSUE_SYNC_MIN_INTERVAL_MS = 60_000;
    let lastIssueSyncAt = 0;
    let issueSyncInFlight = null;

    app.get('/api/media-issues', requireAuth, requireMember, memberApiRateLimit || ((req, res, next) => next()), async (req, res) => {
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

    app.post('/api/media-issues', requireAuth, requireMember, memberApiRateLimit || ((req, res, next) => next()), async (req, res) => {
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

    app.get('/api/media-issues/:issueId/comments', requireAuth, requireMember, memberApiRateLimit || ((req, res, next) => next()), async (req, res) => {
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

    app.post('/api/media-issues/:issueId/comments', requireAuth, requireMember, memberApiRateLimit || ((req, res, next) => next()), async (req, res) => {
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
};
