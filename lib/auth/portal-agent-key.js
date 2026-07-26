import { randomBytes, timingSafeEqual } from 'node:crypto';

const AGENT_USER = Object.freeze({
    id: 'portal-agent',
    username: 'portal-agent',
    email: null,
    isAdmin: true,
    isMember: true,
});

const safeEqual = (left = '', right = '') => {
    const a = Buffer.from(String(left));
    const b = Buffer.from(String(right));
    if (!a.length || a.length !== b.length) return false;
    return timingSafeEqual(a, b);
};

/** Cryptographically random portal agent key (hex). */
export const generatePortalAgentApiKey = () => randomBytes(32).toString('hex');

/**
 * Ensure config.portalAgentApiKey exists; generate + persist when missing.
 * Returns { config, key, created }.
 */
export const ensurePortalAgentApiKey = async (config = {}, { save } = {}) => {
    const existing = String(config?.portalAgentApiKey || '').trim();
    if (existing) {
        return { config, key: existing, created: false };
    }
    const key = generatePortalAgentApiKey();
    const next = { ...config, portalAgentApiKey: key };
    if (typeof save === 'function') {
        await save(next);
    }
    return { config: next, key, created: true };
};

/** Read key from X-Portal-Agent-Key or Authorization: Bearer. */
export const readPortalAgentKeyFromRequest = (req) => {
    const header = String(req?.get?.('x-portal-agent-key') || req?.headers?.['x-portal-agent-key'] || '').trim();
    if (header) return header;
    const auth = String(req?.get?.('authorization') || req?.headers?.authorization || '').trim();
    const match = auth.match(/^Bearer\s+(.+)$/i);
    return match ? match[1].trim() : '';
};

/**
 * If the request presents the configured (or env override) agent key, attach a synthetic admin member.
 * Prefers expectedKey from encrypted config; optional PORTAL_AGENT_API_KEY env override for ops.
 */
export const tryAttachPortalAgent = (req, { expectedKey = '', env = process.env } = {}) => {
    const expected = String(expectedKey || env.PORTAL_AGENT_API_KEY || '').trim();
    const provided = readPortalAgentKeyFromRequest(req);
    if (!expected || !provided || !safeEqual(expected, provided)) return false;
    req.user = { ...AGENT_USER };
    req.portalAgent = true;
    return true;
};
