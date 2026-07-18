export const registerMediaIssueAdminRoutes = ({
    app,
    requireAdmin,
    configPath,
    issuePath,
    loadFile,
    saveFile,
    requestAppService,
    loadIssues,
    findAndSearch,
    resolvePlexTmdbId,
    appendAuditLog,
}) => {
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
