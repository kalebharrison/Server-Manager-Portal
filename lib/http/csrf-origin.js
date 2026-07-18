/**
 * Cookie-session CSRF mitigation: reject cross-site mutating requests.
 * Relies on Origin/Referer matching the request Host (or PUBLIC_BASE_URL host).
 * Session-authenticated mutating calls require Origin or Referer. Unauthenticated
 * API calls (login, invite claim, setup) may omit them for non-browser clients.
 */
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const hostFromUrl = (value) => {
    try {
        return new URL(value).host.toLowerCase();
    } catch {
        return '';
    }
};

export const createCsrfOriginMiddleware = ({ publicBaseUrl = '' } = {}) => {
    const allowedPublicHost = hostFromUrl(publicBaseUrl);

    return (req, res, next) => {
        if (SAFE_METHODS.has(String(req.method || '').toUpperCase())) return next();
        if (!req.path?.startsWith('/api/')) return next();

        const origin = String(req.headers.origin || '').trim();
        const referer = String(req.headers.referer || '').trim();
        const requestHost = String(req.headers.host || '').toLowerCase();
        if (!requestHost) return next();

        const candidateHost = origin
            ? hostFromUrl(origin)
            : referer
                ? hostFromUrl(referer)
                : '';

        const hasSessionCookie = Boolean(req.cookies?.session);
        // Cookie-authenticated mutations need an Origin/Referer browsers always send.
        if (!candidateHost) {
            if (hasSessionCookie) {
                return res.status(403).json({ error: 'Cross-origin request blocked.' });
            }
            return next();
        }

        const allowed = new Set([requestHost]);
        if (allowedPublicHost) allowed.add(allowedPublicHost);
        if (!allowed.has(candidateHost)) {
            return res.status(403).json({ error: 'Cross-origin request blocked.' });
        }
        return next();
    };
};
