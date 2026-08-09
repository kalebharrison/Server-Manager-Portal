import { randomBytes, timingSafeEqual } from 'crypto';

export const INBOUND_WEBHOOK_TOKEN_FIELD = 'inboundWebhookToken';

export const createInboundWebhookToken = () => randomBytes(32).toString('hex');

export const ensureInboundWebhookToken = (config = {}) => {
    const existing = String(config[INBOUND_WEBHOOK_TOKEN_FIELD] || '').trim();
    if (existing) return { config, token: existing, created: false };
    const token = createInboundWebhookToken();
    return {
        config: { ...config, [INBOUND_WEBHOOK_TOKEN_FIELD]: token },
        token,
        created: true,
    };
};

const safeEqualString = (left, right) => {
    const a = Buffer.from(String(left || ''), 'utf8');
    const b = Buffer.from(String(right || ''), 'utf8');
    if (a.length !== b.length) {
        timingSafeEqual(a, a);
        return false;
    }
    return timingSafeEqual(a, b);
};

export const extractInboundWebhookToken = (req = {}) => {
    const auth = String(req.headers?.authorization || req.get?.('authorization') || '');
    if (/^Bearer\s+\S+/i.test(auth)) return auth.replace(/^Bearer\s+/i, '').trim();
    const header = req.headers?.['x-portal-inbound-token'];
    const value = Array.isArray(header) ? header[0] : header;
    return String(value || '').trim();
};

export const inboundWebhookAuthorized = (req, expectedToken) => {
    const expected = String(expectedToken || '').trim();
    if (!expected) return false;
    return safeEqualString(extractInboundWebhookToken(req), expected);
};
