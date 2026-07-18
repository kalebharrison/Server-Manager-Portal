/**
 * Cookie-session CSRF mitigation: reject cross-site mutating requests.
 * Relies on Origin/Referer matching the request Host (or PUBLIC_BASE_URL host).
 * Safe no-op for same-origin browser calls and non-browser clients without Origin
 * when Referer is also absent (CLI/curl); browsers always send Origin on POST.
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

        // No Origin/Referer: allow (non-browser / same-site navigations that omit them).
        if (!candidateHost) return next();

        const allowed = new Set([requestHost]);
        if (allowedPublicHost) allowed.add(allowedPublicHost);
        if (!allowed.has(candidateHost)) {
            return res.status(403).json({ error: 'Cross-origin request blocked.' });
        }
        return next();
    };
};
