import { processMailjetInbound } from './email-inbound-process.js';

export const registerMailjetInboundRoutes = ({
    app,
    configPath,
    usersPath,
    issuePath,
    requestsDir,
    loadFile,
    saveFile,
    appendAuditLog = null,
    discordNotifier = null,
    rateLimit = (_req, _res, next) => next(),
    log = () => {},
}) => {
    app.post('/api/webhooks/mailjet-inbound', rateLimit, async (req, res) => {
        try {
            const config = await loadFile(configPath, {});
            if (!String(config.mailjetInboundSecret || '').trim()) {
                log('[inbound-email] rejected: inbound secret missing');
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
            const from = String(payload.Sender || payload.From || '').slice(0, 200);
            log(`[inbound-email] ${req.get('content-type') || 'no-type'} len=${req.headers['content-length'] || '?'} from=${from || 'unknown'} -> ${result.applied || result.skipped || 'ok'}`);
            if (result.applied && appendAuditLog) {
                await appendAuditLog('inbound_email_received', {
                    username: 'Mailjet',
                    email: from,
                }, null, {
                    kind: result.applied,
                    id: result.id || null,
                    from,
                });
            }
            return res.status(200).json({ ok: true, skipped: result.skipped || null, applied: result.applied || null });
        } catch (error) {
            log(`[inbound-email] webhook failed: ${error.message}`);
            return res.status(500).json({ error: 'Inbound email failed' });
        }
    });
};
