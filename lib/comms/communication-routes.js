import { emailSubject } from './email-identity.js';
import { buildAnnouncementEmailHtml } from './email-templates.js';
import { clientErrorMessage } from '../http/safe-client-error.js';

export const registerCommunicationRoutes = ({
    app,
    requireAdmin,
    adminSensitiveRateLimit = (req, res, next) => next(),
    configPath,
    usersPath,
    loadFile,
    saveFile,
    startBroadcast,
    sendTestBroadcast,
    sendTestNewsletter,
    sendManualNewsletter,
    sendEmail,
    escapeHtmlAttr,
    discordNotifier = null,
    upgrader = null,
    log,
}) => {
    const CONFIG_PATH = configPath;
    const USERS_PATH = usersPath;

    app.post('/api/users/broadcast', requireAdmin, adminSensitiveRateLimit, async (req, res) => {
        const { subject, body, recipientFilter, selectedUserIds } = req.body;
        if (!subject || !body) return res.status(400).json({ error: 'Subject and body are required.' });

        try {
            const result = await startBroadcast({ subject, body, recipientFilter, selectedUserIds });
            res.json({ message: `Broadcast started for ${result.count} users.`, count: result.count });
        } catch (error) {
            log(`Error sending broadcast: ${error.message}`);
            res.status(error.statusCode || 500).json({ error: clientErrorMessage(error, 'Failed to initiate broadcast.') });
        }
    });

    app.post('/api/users/broadcast/test', requireAdmin, adminSensitiveRateLimit, async (req, res) => {
        const { subject, body } = req.body;
        if (!subject || !body) return res.status(400).json({ error: 'Subject and body are required.' });

        try {
            await sendTestBroadcast({ subject, body, adminEmail: req.user.email });
            res.json({ message: `Test email sent successfully to ${req.user.email}` });
        } catch (error) {
            log(`Error sending test broadcast: ${error.message}`);
            res.status(error.statusCode || 500).json({ error: clientErrorMessage(error, 'Failed to send test broadcast.') });
        }
    });

    app.post('/api/newsletter/test', requireAdmin, adminSensitiveRateLimit, async (req, res) => {
        try {
            const config = await loadFile(CONFIG_PATH, {});
            await sendTestNewsletter(config);
            res.json({ success: true });
        } catch (e) {
            log(`Newsletter test error: ${e.message}`);
            res.status(e.statusCode || 500).json({ error: clientErrorMessage(e, 'Newsletter test failed.') });
        }
    });

    app.post('/api/newsletter/send-now', requireAdmin, adminSensitiveRateLimit, async (req, res) => {
        try {
            const config = await loadFile(CONFIG_PATH, {});
            const users = await loadFile(USERS_PATH, []);
            const validUsers = users.filter(u => u.email);
            if (validUsers.length === 0) return res.status(400).json({ error: 'No users with email addresses found.' });
            res.json({ success: true, message: `Sending to ${validUsers.length} users...` });
            await sendManualNewsletter(config);
        } catch (e) {
            log(`Newsletter send-now error: ${e.message}`);
            if (!res.headersSent) res.status(e.statusCode || 500).json({ error: clientErrorMessage(e, 'Newsletter send failed.') });
        }
    });

    app.post('/api/discord/test-media-announce', requireAdmin, adminSensitiveRateLimit, async (req, res) => {
        try {
            if (!upgrader?.mediaAnnounce?.postTestAnnounces) {
                return res.status(500).json({ error: 'Media announce service is unavailable.' });
            }
            const config = await loadFile(CONFIG_PATH, {});
            const index = typeof upgrader.loadIndex === 'function'
                ? await upgrader.loadIndex()
                : { items: [] };
            const result = await upgrader.mediaAnnounce.postTestAnnounces(config, { index });
            if (!result?.posted?.length) {
                return res.status(500).json({ error: 'Could not build test media posts.' });
            }
            const labels = result.posted.map((entry) => `${entry.title} (${entry.source})`).join(', ');
            res.json({
                success: true,
                posted: result.posted,
                message: `Posted test previews: ${labels}.`,
            });
        } catch (error) {
            log(`Discord media announce test error: ${error.message}`);
            res.status(error.statusCode || 500).json({
                error: clientErrorMessage(error, 'Failed to post test media announces.'),
            });
        }
    });

    app.post('/api/announcements/push', requireAdmin, adminSensitiveRateLimit, async (req, res) => {
        const { text, sendEmail: shouldSendEmail } = req.body;

        try {
            const config = await loadFile(CONFIG_PATH, {});
            config.announcement = text || '';
            await saveFile(CONFIG_PATH, config);

            if (shouldSendEmail && text) {
                void discordNotifier?.notifyAnnouncement?.(config, { text })
                    .catch((error) => log(`Discord announcement mirror failed: ${error.message}`));
                const users = await loadFile(USERS_PATH, []);
                const activeUsers = users.filter(u => u.plexAccessStatus === 'active' && u.email);
                if (activeUsers.length > 0) {
                    const totalDuration = 30 * 60 * 1000;
                    const delayPerUser = Math.floor(totalDuration / activeUsers.length);
                    (async () => {
                        log(`Starting staggered announcement email push to ${activeUsers.length} users over 30 minutes.`);
                        let sentCount = 0;
                        for (let i = 0; i < activeUsers.length; i++) {
                            const user = activeUsers[i];
                            const html = buildAnnouncementEmailHtml({
                                text: escapeHtmlAttr(String(text || '')),
                                config,
                            });
                            try {
                                await sendEmail(config, user.email, emailSubject(config, 'Server announcement'), html);
                                sentCount++;
                            } catch (emailErr) {
                                log(`Failed to send announcement email to ${user.email}`);
                            }

                            if (i < activeUsers.length - 1) {
                                await new Promise(resolve => setTimeout(resolve, delayPerUser));
                            }
                        }
                        log(`Completed staggered announcement email push. Sent ${sentCount} emails.`);
                    })();
                }
            }
            res.json({ success: true, message: 'Announcement updated' });
        } catch (e) {
            log(`Error pushing announcement: ${e.message}`);
            res.status(500).json({ error: 'Failed to update announcement' });
        }
    });
};
