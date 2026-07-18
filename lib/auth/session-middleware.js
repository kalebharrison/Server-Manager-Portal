import { isImpersonatingSession } from './impersonation.js';
import { isPortalConfigured } from './admin-identity.js';
import { verifySessionJwt } from './jwt-session.js';

export const createSessionMiddleware = ({
    jwt,
    jwtSecret,
    loadFile,
    configPath,
    resolveCurrentAdmin,
}) => {
    const requireAuth = (req, res, next) => {
        const token = req.cookies.session;
        if (!token) return res.status(401).json({ error: 'Unauthorized' });
        try {
            req.user = verifySessionJwt(jwt, token, jwtSecret);
            next();
        } catch (e) {
            return res.status(401).json({ error: 'Invalid session' });
        }
    };

    const requireAdmin = async (req, res, next) => {
        // Reuse identity already verified by requireAuth when present.
        if (!req.user) {
            const token = req.cookies.session;
            if (!token) return res.status(401).json({ error: 'Unauthorized' });
            try {
                req.user = verifySessionJwt(jwt, token, jwtSecret);
            } catch (e) {
                return res.status(401).json({ error: 'Invalid session' });
            }
        }
        if (isImpersonatingSession(req.user)) {
            return res.status(403).json({ error: 'Admin actions are disabled while viewing as another user.' });
        }

        const config = await loadFile(configPath, {});
        if (!isPortalConfigured(config)) {
            return res.status(403).json({ error: 'Forbidden: App not configured' });
        }

        const isAdmin = await resolveCurrentAdmin(req.user, config);
        if (!isAdmin) {
            return res.status(403).json({ error: 'Forbidden: Admins only' });
        }
        req.user.isAdmin = true;
        next();
    };

    const getSessionUser = (req) => {
        const token = req.cookies.session;
        if (!token) return null;
        try {
            return verifySessionJwt(jwt, token, jwtSecret);
        } catch (e) {
            return null;
        }
    };

    return {
        requireAuth,
        requireAdmin,
        getSessionUser,
    };
};
