import { INBOUND_EMAIL_WEBHOOK_PATHS } from './email-inbound-paths.js';
import { inboundRepliesAreEnabled } from './email-inbound.js';
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
    const handleInbound = async (req, res) => {
        try {
            const config = await loadFile(configPath, {});
            if (!inboundRepliesAreEnabled(config) || !String(config.mailjetInboundSecret || '').trim()) {
                log('[inbound-email] rejected: inbound replies are not enabled');
                return res.status(503).json({ error: 'Inbound email is not enabled' });
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
                    username: 'Inbound',
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
    };

    INBOUND_EMAIL_WEBHOOK_PATHS.forEach((routePath) => {
        app.post(routePath, rateLimit, handleInbound);
    });
};
