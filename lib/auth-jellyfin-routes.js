import { randomUUID } from 'crypto';
import fetch from 'node-fetch';
import jwt from 'jsonwebtoken';

import { isDeletedUser } from './deleted-users.js';

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
    log,
}) => {
    const CONFIG_PATH = configPath;
    const USERS_PATH = usersPath;
    const DELETED_USERS_PATH = deletedUsersPath;
    const JWT_SECRET = jwtSecret;
    const FORCE_SECURE_COOKIES = forceSecureCookies;

    const jellyfinQuickConnectSessions = new Map();
    const MAX_JELLYFIN_QUICK_CONNECT_SESSIONS = 100;

    const pruneJellyfinQuickConnectSessions = () => {
        const now = Date.now();
        jellyfinQuickConnectSessions.forEach((session, id) => {
            if (!session?.expiresAt || session.expiresAt <= now) {
                jellyfinQuickConnectSessions.delete(id);
            }
        });
    };

    const storeJellyfinQuickConnectSession = (sessionId, session) => {
        pruneJellyfinQuickConnectSessions();
        while (jellyfinQuickConnectSessions.size >= MAX_JELLYFIN_QUICK_CONNECT_SESSIONS) {
            const oldestKey = jellyfinQuickConnectSessions.keys().next().value;
            if (!oldestKey) break;
            jellyfinQuickConnectSessions.delete(oldestKey);
        }
        jellyfinQuickConnectSessions.set(sessionId, session);
    };

    const completeJellyfinPortalLogin = async (req, res, config, authData, source = 'password') => {
        const jellyfinUser = authData?.User || authData?.user || {};
        const accessToken = authData?.AccessToken || authData?.accessToken || '';
        const userId = jellyfinUser.Id || jellyfinUser.id || '';
        const username = jellyfinUser.Name || jellyfinUser.name || 'Jellyfin User';
        const isAdmin = jellyfinUser?.Policy?.IsAdministrator === true || jellyfinUser?.policy?.isAdministrator === true;
        const sessionUser = {
            id: userId ? `jellyfin:${userId}` : `jellyfin:${username}`,
            jellyfinId: userId,
            authProvider: 'jellyfin',
            username,
            email: '',
            thumb: userId ? withBasePath(`/api/jellyfin/user-image?userId=${encodeURIComponent(userId)}`) : null,
            jellyfinIsAdmin: isAdmin,
            isAdmin,
        };

        const deletedUsers = await loadFile(DELETED_USERS_PATH, []);
        if (!isAdmin && isDeletedUser(deletedUsers, sessionUser)) {
            await appendAuditLog('login_blocked_deleted_user', sessionUser, sessionUser);
            clearSessionCookie(req, res);
            return res.status(403).json({ error: 'Your portal session has expired. Please contact the admin for access.' });
        }

        const users = await loadFile(USERS_PATH, []);
        const knownUser = findLocalUserForSession(users, sessionUser);
        if (!isAdmin && !knownUser) {
            await appendAuditLog('login_blocked_non_member', sessionUser, sessionUser);
            clearSessionCookie(req, res);
            log(`Jellyfin ${source} login blocked for ${sessionUser.username}: not a portal member`);
            return res.status(403).json({ error: 'Your account is not registered for this portal.' });
        }

        if (!isAdmin && knownUser) {
            knownUser.lastLogin = new Date().toISOString();
            if (!knownUser.jellyfinId && sessionUser.jellyfinId) knownUser.jellyfinId = sessionUser.jellyfinId;
            await saveFile(USERS_PATH, users);
        }

        const token = jwt.sign(sessionUser, JWT_SECRET, { expiresIn: '7d' });
        setSessionCookie(req, res, token);
        await appendAuditLog('user_login', sessionUser, sessionUser);
        log(`Jellyfin ${source} login success for ${sessionUser.username} (admin=${isAdmin}, secureCookie=${FORCE_SECURE_COOKIES}, token=${accessToken ? 'received' : 'missing'})`);
        return res.json({ success: true, user: { username: sessionUser.username, jellyfinId: sessionUser.jellyfinId, isAdmin } });
    };

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
            const response = await fetch(`${baseUrl}/Users/AuthenticateByName`, {
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
            const enabledRes = await fetch(`${baseUrl}/QuickConnect/Enabled`, {
                headers: jellyfinHeaders(''),
            });
            if (enabledRes.ok) {
                const enabledText = await enabledRes.text();
                if (String(enabledText).trim().toLowerCase() === 'false') {
                    return res.status(400).json({ error: 'Quick Connect is disabled on your Jellyfin server.' });
                }
            }

            const initiateRes = await fetch(`${baseUrl}/QuickConnect/Initiate`, {
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

            const stateRes = await fetch(`${quickSession.baseUrl}/QuickConnect/Connect?secret=${encodeURIComponent(quickSession.secret)}`, {
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

            const authRes = await fetch(`${quickSession.baseUrl}/Users/AuthenticateWithQuickConnect`, {
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
