export const createSessionCookies = ({ basePath, forceSecureCookies }) => {
    // Prefer FORCE_SECURE_COOKIES, otherwise mark Secure only when the request itself is HTTPS
    // (via trust proxy). Plain HTTP LAN logins keep non-Secure cookies.
    const sessionCookieBase = (req) => ({
        httpOnly: true,
        secure: forceSecureCookies || !!req?.secure,
        sameSite: 'lax',
        path: basePath || '/',
    });

    const clearSessionCookie = (req, res) => {
        res.clearCookie('session', sessionCookieBase(req));
    };

    const setSessionCookie = (req, res, token, { maxAgeMs = 7 * 24 * 60 * 60 * 1000 } = {}) => {
        res.cookie('session', token, {
            ...sessionCookieBase(req),
            maxAge: maxAgeMs,
        });
    };

    return {
        sessionCookieBase,
        clearSessionCookie,
        setSessionCookie,
    };
};
