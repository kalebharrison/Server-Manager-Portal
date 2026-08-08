import { blockIfImpersonating } from '../auth/impersonation.js';
import { buildPortalHomeUrl, emailNoticeSubject, resolveEmailPosterUrl } from '../comms/email-identity.js';
import { resolveOwnerInbox } from '../comms/email-recipients.js';
import { buildMediaIssueReportHtml } from '../comms/email-templates.js';
import { USERS_PATH } from '../config/data-paths.js';
import { buildPlexWatchUrl } from '../media/library-deep-link.js';

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
            const users = await loadFile(USERS_PATH, []);
            const ownerInbox = resolveOwnerInbox(config, users);
            if (!ownerInbox) return res.status(503).json({ error: 'No owner inbox configured. Set Contact Email in settings.' });

            const { title, key, issue, posterPath, thumbUrl } = req.body;
            if (!title || !issue) return res.status(400).json({ error: 'Missing title or issue' });

            const safeTitle = escapeHtmlAttr(String(title || ''));
            const safeKey = key ? escapeHtmlAttr(String(key)) : '';
            const safeUsername = escapeHtmlAttr(String(req.user.username || 'Unknown'));
            const safeIssue = escapeHtmlAttr(String(issue || '')).replace(/\n/g, '<br/>');
            const subject = emailNoticeSubject(config, 'Playback Issue', String(title || '').slice(0, 120));
            const plexUrl = buildPlexWatchUrl(config.serverIdentifier, key);
            const portalUrl = buildPortalHomeUrl(config);
            const html = buildMediaIssueReportHtml({
                username: safeUsername,
                title: safeTitle,
                key: safeKey,
                issue: safeIssue,
                config,
                posterUrl: resolveEmailPosterUrl(config, posterPath || thumbUrl),
                links: [
                    portalUrl ? { label: 'Open Server Portal', url: portalUrl } : null,
                    plexUrl ? { label: 'Watch on Plex', url: plexUrl } : null,
                ].filter(Boolean),
            });

            await sendEmail(config, ownerInbox, subject, html);
            res.json({ success: true });
        } catch (e) {
            log(`Error reporting issue: ${e.message}`);
            res.status(500).json({ error: 'Failed to report issue' });
        }
    });
};
