import jwt from 'jsonwebtoken';

import { verifySessionJwt } from '../auth/jwt-session.js';

export const createIntegrationTestAccess = ({
    configPath,
    secretMask,
    jwtSecret,
    loadFile,
    isPortalConfigured,
    resolveCurrentAdmin,
    normalizePlexToken,
    fetchOwnedPlexServers,
    validatePlexServerAdminToken,
    verifyInitialSetupPlexOwner,
    canRunInitialSetup,
    log,
}) => {
    const CONFIG_PATH = configPath;
    const SECRET_MASK = secretMask;
    const JWT_SECRET = jwtSecret;

    const UNCONFIGURED_SETUP_ACCESS_DENIED = 'Initial setup access denied. Use localhost, configure SETUP_TOKEN, or provide a valid Plex server owner token.';

    const verifyPlexOwnerTokenForSetup = async (plexToken, plexServerUrl = '') => {
        const token = normalizePlexToken(plexToken);
        if (!token || token === SECRET_MASK) return false;
        try {
            const servers = await fetchOwnedPlexServers(token);
            if (servers.length > 0) return true;
        } catch (e) {
            log(`Plex owner token verification via Plex.tv failed: ${e.message}`);
        }
        const directUrl = String(plexServerUrl || '').trim();
        return directUrl ? validatePlexServerAdminToken(token, directUrl) : false;
    };

    const assertUnconfiguredSensitiveSetupAccess = async (req, res, stored) => {
        if (canRunInitialSetup(req)) return true;
        const token = req.body?.token;
        const directUrl = req.body?.plexServerUrl || stored?.plexServerUrl || '';
        const type = String(req.body?.type || '').toLowerCase();
        const serverIdentifier = req.body?.serverIdentifier;
        if (type === 'plex' && serverIdentifier) {
            const verified = await verifyInitialSetupPlexOwner(token, serverIdentifier, directUrl, stored);
            if (verified) return true;
        }
        if (await verifyPlexOwnerTokenForSetup(token, directUrl)) return true;
        res.status(403).json({ error: UNCONFIGURED_SETUP_ACCESS_DENIED });
        return false;
    };

    const assertIntegrationTestAccess = async (req, res) => {
        const stored = await loadFile(CONFIG_PATH, {});
        const isConfigured = isPortalConfigured(stored);
        if (isConfigured) {
            const sessionToken = req.cookies && req.cookies.session;
            if (!sessionToken) {
                res.status(403).json({ error: 'Forbidden: admin login required.' });
                return false;
            }
            try {
                const decoded = verifySessionJwt(jwt, sessionToken, JWT_SECRET);
                const isAdmin = await resolveCurrentAdmin(decoded, stored);
                if (!isAdmin) {
                    res.status(403).json({ error: 'Forbidden: admins only.' });
                    return false;
                }
                req.user = decoded;
            } catch (e) {
                res.status(403).json({ error: 'Forbidden: invalid session.' });
                return false;
            }
            return true;
        }
        return assertUnconfiguredSensitiveSetupAccess(req, res, stored);
    };

    return { assertIntegrationTestAccess };
};

export const resolveTestCredential = (incoming, existing, secretMask) => {
    if (incoming === undefined || incoming === null || incoming === '') return existing || '';
    if (incoming === secretMask) return existing || '';
    return String(incoming);
};

export const resolveIntegrationUrlForTest = async (incoming, existing, { secretMask, sanitizeIntegrationUrl }) => {
    const url = resolveTestCredential(incoming, existing, secretMask);
    if (!url) return '';
    // Always apply the same private-host/DNS policy used on config saves.
    return sanitizeIntegrationUrl(url);
};

export const isSeerrFamilyRequestApp = (type) => {
    const lower = String(type || '').toLowerCase();
    return lower === 'seerr' || lower === 'overseerr' || lower === 'jellyseerr';
};
