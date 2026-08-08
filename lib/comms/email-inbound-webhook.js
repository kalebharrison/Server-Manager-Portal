import { processMailjetInbound } from './email-inbound-process.js';

export const registerMailjetInboundRoutes = ({
    app,
    configPath,
    usersPath,
    issuePath,
    requestsDir,
    loadFile,
    saveFile,
    discordNotifier = null,
    rateLimit = (_req, _res, next) => next(),
    log = () => {},
}) => {
    app.post('/api/webhooks/mailjet-inbound', rateLimit, async (req, res) => {
        try {
            const config = await loadFile(configPath, {});
            if (!String(config.mailjetInboundSecret || '').trim()) {
                return res.status(503).json({ error: 'Inbound email is not configured' });
            }
            const payload = req.body && typeof req.body === 'object' && !Array.isArray(req.body)
                ? req.body
                : {};
            const result = await processMailjetInbound({
                config,
                payload,
                loadFile,
                saveFile,
                usersPath,
                issuePath,
                requestsDir,
                discordNotifier,
                log,
            });
            return res.status(200).json({ ok: true, skipped: result.skipped || null, applied: result.applied || null });
        } catch (error) {
            log(`[inbound-email] webhook failed: ${error.message}`);
            return res.status(500).json({ error: 'Inbound email failed' });
        }
    });
};
