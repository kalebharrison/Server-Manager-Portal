import { blockIfImpersonating } from '../auth/impersonation.js';
import { buildMediaIssueReportHtml } from '../comms/email-templates.js';

export const registerPlexReportIssueRoute = ({
    app,
    requireAuth,
    requireMember,
    configPath,
    loadFile,
    sendEmail,
    escapeHtmlAttr,
    log,
}) => {
    app.post('/api/plex/report-issue', requireAuth, requireMember, async (req, res) => {
        if (blockIfImpersonating(req, res)) return;
        try {
            const config = await loadFile(configPath, null);
            if (!config || !config.smtpUser) return res.status(503).json({ error: 'SMTP not configured' });

            const { title, key, issue } = req.body;
            if (!title || !issue) return res.status(400).json({ error: 'Missing title or issue' });

            const safeTitle = escapeHtmlAttr(String(title || ''));
            const safeKey = key ? escapeHtmlAttr(String(key)) : '';
            const safeUsername = escapeHtmlAttr(String(req.user.username || 'Unknown'));
            const safeIssue = escapeHtmlAttr(String(issue || '')).replace(/\n/g, '<br/>');
            const subject = `Plex Issue Report: ${String(title || '').slice(0, 120)}`;
            const html = buildMediaIssueReportHtml({
                username: safeUsername,
                title: safeTitle,
                key: safeKey,
                issue: safeIssue,
            });

            await sendEmail(config, config.smtpUser, subject, html);
            res.json({ success: true });
        } catch (e) {
            log(`Error reporting issue: ${e.message}`);
            res.status(500).json({ error: 'Failed to report issue' });
        }
    });
};
