import { randomUUID } from 'crypto';

import { createJellyfinAdminResolver } from './jellyfin-admin-resolver.js';
import { createJellyfinPortalLogin, createJellyfinQuickConnectStore } from './jellyfin-auth-login.js';

export { createJellyfinAdminResolver } from './jellyfin-admin-resolver.js';

export const registerJellyfinAuthRoutes = ({
    app,
    authRateLimit,
    jellyfinQuickConnectPollRateLimit,
    configPath,
    usersPath,
    deletedUsersPath,
    jwtSecret,
    forceSecureCookies,
    loadFile,
    saveFile,
    jellyfinHeaders,
    isJellyfinConfigured,
    resolveIntegrationUrlForFetch,
    withBasePath,
    clearSessionCookie,
    setSessionCookie,
    appendAuditLog,
    findLocalUserForSession,
    isEligibleMember,
    log,
    fetchImpl = fetch,
}) => {
    const CONFIG_PATH = configPath;

    const {
        jellyfinQuickConnectSessions,
        pruneJellyfinQuickConnectSessions,
        storeJellyfinQuickConnectSession,
    } = createJellyfinQuickConnectStore();

    const completeJellyfinPortalLogin = createJellyfinPortalLogin({
        usersPath,
        deletedUsersPath,
        jwtSecret,
        forceSecureCookies,
        loadFile,
        saveFile,
        withBasePath,
        clearSessionCookie,
        setSessionCookie,
        appendAuditLog,
        findLocalUserForSession,
        isEligibleMember,
        log,
    });

    app.post('/api/auth/jellyfin/login', authRateLimit, async (req, res) => {
        const { username, password } = req.body || {};
        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password are required' });
        }

        try {
            const config = await loadFile(CONFIG_PATH, {});
            if (!isJellyfinConfigured(config)) {
                return res.status(400).json({ error: 'Jellyfin authentication is not configured' });
            }

            const baseUrl = resolveIntegrationUrlForFetch(config.jellyfinUrl);
            const response = await fetchImpl(`${baseUrl}/Users/AuthenticateByName`, {
                method: 'POST',
                headers: jellyfinHeaders('', { 'Content-Type': 'application/json' }),
                body: JSON.stringify({ Username: username, Pw: password }),
            });

            if (!response.ok) {
                await response.text().catch(() => '');
                log(`Jellyfin login failed for ${username} with HTTP ${response.status}.`);
                return res.status(401).json({ error: 'Invalid Jellyfin username or password' });
            }

            return completeJellyfinPortalLogin(req, res, config, await response.json(), 'password');
        } catch (err) {
            log('Error in jellyfin login: ' + err.message);
            res.status(500).json({ error: 'Failed to authenticate with Jellyfin' });
        }
    });

    app.post('/api/auth/jellyfin/quick-connect/initiate', authRateLimit, async (req, res) => {
        try {
            pruneJellyfinQuickConnectSessions();
            const config = await loadFile(CONFIG_PATH, {});
            if (!isJellyfinConfigured(config)) {
                return res.status(400).json({ error: 'Jellyfin authentication is not configured' });
            }

            const baseUrl = resolveIntegrationUrlForFetch(config.jellyfinUrl);
            const enabledRes = await fetchImpl(`${baseUrl}/QuickConnect/Enabled`, {
                headers: jellyfinHeaders(''),
            });
            if (enabledRes.ok) {
                const enabledText = await enabledRes.text();
                if (String(enabledText).trim().toLowerCase() === 'false') {
                    return res.status(400).json({ error: 'Quick Connect is disabled on your Jellyfin server.' });
                }
            }

            const initiateRes = await fetchImpl(`${baseUrl}/QuickConnect/Initiate`, {
                method: 'POST',
                headers: jellyfinHeaders(''),
            });
            if (!initiateRes.ok) {
                await initiateRes.text().catch(() => '');
                log(`Jellyfin Quick Connect initiate failed with HTTP ${initiateRes.status}.`);
                return res.status(502).json({ error: 'Failed to start Jellyfin Quick Connect.' });
            }

            const state = await initiateRes.json();
            const secret = state.Secret || state.secret;
            const code = state.Code || state.code;
            if (!secret || !code) {
                return res.status(502).json({ error: 'Jellyfin did not return a Quick Connect code.' });
            }

            const sessionId = randomUUID();
            storeJellyfinQuickConnectSession(sessionId, {
                secret,
                baseUrl,
                expiresAt: Date.now() + 5 * 60 * 1000,
            });
            res.json({ sessionId, code, jellyfinUrl: config.jellyfinUrl });
        } catch (err) {
            log('Error starting jellyfin quick connect: ' + err.message);
            res.status(500).json({ error: 'Failed to start Jellyfin Quick Connect' });
        }
    });

    app.post('/api/auth/jellyfin/quick-connect/poll', jellyfinQuickConnectPollRateLimit, async (req, res) => {
        const { sessionId } = req.body || {};
        if (!sessionId) return res.status(400).json({ error: 'sessionId is required' });

        try {
            pruneJellyfinQuickConnectSessions();
            const quickSession = jellyfinQuickConnectSessions.get(sessionId);
            if (!quickSession) {
                return res.status(404).json({ error: 'Quick Connect session expired. Please try again.' });
            }

            const config = await loadFile(CONFIG_PATH, {});
            if (!isJellyfinConfigured(config)) {
                return res.status(400).json({ error: 'Jellyfin authentication is not configured' });
            }

            const stateRes = await fetchImpl(`${quickSession.baseUrl}/QuickConnect/Connect?secret=${encodeURIComponent(quickSession.secret)}`, {
                headers: jellyfinHeaders(''),
            });
            if (!stateRes.ok) {
                await stateRes.text().catch(() => '');
                log(`Jellyfin Quick Connect poll failed with HTTP ${stateRes.status}.`);
                return res.status(502).json({ error: 'Failed to check Jellyfin Quick Connect status.' });
            }
            const state = await stateRes.json();
            const authenticated = state.Authenticated === true || state.authenticated === true;
            if (!authenticated) {
                return res.json({ authenticated: false });
            }

            const authRes = await fetchImpl(`${quickSession.baseUrl}/Users/AuthenticateWithQuickConnect`, {
                method: 'POST',
                headers: jellyfinHeaders('', { 'Content-Type': 'application/json' }),
                body: JSON.stringify({ Secret: quickSession.secret }),
            });
            if (!authRes.ok) {
                await authRes.text().catch(() => '');
                log(`Jellyfin Quick Connect token exchange failed with HTTP ${authRes.status}.`);
                return res.status(502).json({ error: 'Jellyfin approved the code, but token exchange failed.' });
            }

            jellyfinQuickConnectSessions.delete(sessionId);
            return completeJellyfinPortalLogin(req, res, config, await authRes.json(), 'quick-connect');
        } catch (err) {
            log('Error polling jellyfin quick connect: ' + err.message);
            res.status(500).json({ error: 'Failed to finish Jellyfin Quick Connect' });
        }
    });
};
