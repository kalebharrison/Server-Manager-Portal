import { timingSafeEqual } from 'node:crypto';

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

export const getPortalAgentApiKey = (env = process.env) => String(env.PORTAL_AGENT_API_KEY || '').trim();

/** Read key from X-Portal-Agent-Key or Authorization: Bearer. */
export const readPortalAgentKeyFromRequest = (req) => {
    const header = String(req?.get?.('x-portal-agent-key') || req?.headers?.['x-portal-agent-key'] || '').trim();
    if (header) return header;
    const auth = String(req?.get?.('authorization') || req?.headers?.authorization || '').trim();
    const match = auth.match(/^Bearer\s+(.+)$/i);
    return match ? match[1].trim() : '';
};

/**
 * If PORTAL_AGENT_API_KEY matches the request, attach a synthetic admin member user.
 * Returns true when attached.
 */
export const tryAttachPortalAgent = (req, env = process.env) => {
    const expected = getPortalAgentApiKey(env);
    const provided = readPortalAgentKeyFromRequest(req);
    if (!expected || !provided || !safeEqual(expected, provided)) return false;
    req.user = { ...AGENT_USER };
    req.portalAgent = true;
    return true;
};
