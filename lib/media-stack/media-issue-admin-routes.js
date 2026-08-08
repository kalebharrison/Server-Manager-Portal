export const registerMediaIssueAdminRoutes = ({
    app,
    requireAdmin,
    configPath,
    issuePath,
    loadFile,
    saveFile,
    loadIssues,
    findAndSearch,
    appendAuditLog,
    notifyIssueReply = null,
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

    app.post('/api/media-issues/:issueId/resolve', requireAdmin, async (req, res) => {
        const issues = await loadIssues();
        const index = issues.findIndex((issue) => issue.id === req.params.issueId);
        if (index < 0) return res.status(404).json({ error: 'Issue not found.' });
        issues[index] = { ...issues[index], status: 'resolved', updatedAt: new Date().toISOString() };
        await saveFile(issuePath, issues);
        if (notifyIssueReply && issues[index].source === 'portal') {
            const configForMail = await loadFile(configPath, {});
            void notifyIssueReply(configForMail, { issue: issues[index], statusLabel: 'resolved' });
        }
        res.json({ success: true });
    });
};
