import jwt from 'jsonwebtoken';

import { verifySessionJwt } from './jwt-session.js';
import { fetchPlexPinAuthToken, createPlexPinLoginHandler } from './plex-pin-auth.js';

export const registerPlexAuthRoutes = ({
    app,
    authRateLimit,
    authCallbackRateLimit,
    setupRateLimit,
    configPath,
    usersPath,
    deletedUsersPath,
    jwtSecret,
    forceSecureCookies,
    loadFile,
    saveFile,
    apiFetch,
    getClientId,
    withBasePath,
    clearSessionCookie,
    setSessionCookie,
    appendAuditLog,
    findLocalUserForSession,
    syncAdminPlexIdFromConfigToken,
    getAdminId,
    isPortalConfigured,
    canRunInitialSetup,
    inviteUserToPlex,
    fetchOwnedPlexServers,
    isEligibleMember,
    log,
    fetchImpl = fetch,
}) => {
    const CONFIG_PATH = configPath;
    const JWT_SECRET = jwtSecret;

    const fetchPinToken = (pinId, opts = {}) => fetchPlexPinAuthToken(pinId, { getClientId, log, fetchImpl, ...opts });

    const handlePlexPinLogin = createPlexPinLoginHandler({
        configPath,
        usersPath,
        deletedUsersPath,
        jwtSecret,
        forceSecureCookies,
        loadFile,
        saveFile,
        apiFetch,
        withBasePath,
        clearSessionCookie,
        setSessionCookie,
        appendAuditLog,
        findLocalUserForSession,
        syncAdminPlexIdFromConfigToken,
        getAdminId,
        inviteUserToPlex,
        isEligibleMember,
        log,
        fetchPlexPinAuthToken: fetchPinToken,
    });

    const assertInitialSetupAccess = async (req, res, options = {}) => {
        const existingConfig = await loadFile(CONFIG_PATH, {});
        const isConfigured = isPortalConfigured(existingConfig);
        if (isConfigured) {
            res.status(403).json({ error: 'Portal is already configured.' });
            return false;
        }
        if (options.allowUnconfigured === true) return true;
        if (canRunInitialSetup(req)) return true;
        const sessionToken = req.cookies && req.cookies.session;
        if (sessionToken) {
            try {
                verifySessionJwt(jwt, sessionToken, JWT_SECRET);
                return true;
            } catch (e) { /* fall through */ }
        }
        res.status(403).json({ error: 'Initial setup denied: localhost, valid setup token, or admin session required.' });
        return false;
    };

    app.post('/api/auth/plex/login', authRateLimit, async (req, res) => {
        try {
            const clientId = getClientId();
            const response = await fetchImpl('https://plex.tv/api/v2/pins?strong=true', {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'X-Plex-Product': 'Server Manager Portal',
                    'X-Plex-Client-Identifier': clientId,
                },
            });
            if (!response.ok) throw new Error('Failed to generate Plex PIN');
            const data = await response.json();
            res.json({ ...data, clientIdentifier: clientId });
        } catch (err) {
            log('Error in plex login: ' + err.message);
            res.status(500).json({ error: 'Failed to initiate login' });
        }
    });

    app.post('/api/auth/plex/callback', authCallbackRateLimit, async (req, res) => {
        const { pinId, ref } = req.body;
        if (!pinId) return res.status(400).json({ error: 'pinId is required' });

        try {
            await handlePlexPinLogin(req, res, pinId, ref);
        } catch (err) {
            log('Error in plex callback: ' + err.message);
            res.status(500).json({ error: 'Failed to verify login' });
        }
    });

    app.get('/api/auth/plex/callback', authCallbackRateLimit, async (req, res) => {
        const { pinId, ref } = req.query;
        if (!pinId) return res.redirect(withBasePath('/?loginError=' + encodeURIComponent('Missing pin ID')));

        try {
            await handlePlexPinLogin(req, res, String(pinId), ref, { redirectOnSuccess: true });
        } catch (err) {
            log('Error in plex GET callback: ' + err.message);
            clearSessionCookie(req, res);
            res.redirect(withBasePath('/?loginError=' + encodeURIComponent('Login failed. Please try again.')));
        }
    });

    app.post('/api/setup/plex/callback', setupRateLimit, authRateLimit, async (req, res) => {
        if (!(await assertInitialSetupAccess(req, res, { allowUnconfigured: true }))) return;
        const { pinId } = req.body;
        if (!pinId) return res.status(400).json({ error: 'pinId is required' });

        try {
            const pinData = await fetchPinToken(pinId);
            if (!pinData.authToken) {
                return res.status(400).json({ error: 'Plex sign-in not completed yet. Please try again.' });
            }

            const userRes = await apiFetch('https://plex.tv/api/v2/user', pinData.authToken);
            if (!userRes.ok) throw new Error('Failed to fetch Plex user info');
            const userData = await userRes.json();

            const servers = await fetchOwnedPlexServers(pinData.authToken);
            if (!servers.length) {
                return res.status(400).json({ error: 'No owned Plex servers found for this account. You must sign in as the server owner.' });
            }

            res.json({
                token: pinData.authToken,
                servers,
                username: userData.username || userData.title || userData.email || 'Plex User',
                email: userData.email || '',
            });
        } catch (err) {
            log(`Setup Plex callback error: ${err.message}`);
            res.status(500).json({ error: 'Failed to complete Plex sign-in.' });
        }
    });
};
