import jwt from 'jsonwebtoken';

import { isDeletedUser } from '../users/deleted-users.js';
import { ensureAdminPortalUser } from '../users/ensure-admin-portal-user.js';
import { signSessionJwt } from './jwt-session.js';

export const createJellyfinQuickConnectStore = () => {
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

    return {
        jellyfinQuickConnectSessions,
        pruneJellyfinQuickConnectSessions,
        storeJellyfinQuickConnectSession,
    };
};

export const createJellyfinPortalLogin = ({
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
}) => {
    const USERS_PATH = usersPath;
    const DELETED_USERS_PATH = deletedUsersPath;
    const JWT_SECRET = jwtSecret;
    const FORCE_SECURE_COOKIES = forceSecureCookies;

    return async (req, res, config, authData, source = 'password') => {
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

        let users = await loadFile(USERS_PATH, []);
        let knownUser = findLocalUserForSession(users, sessionUser);
        if (!isAdmin && (!knownUser || !isEligibleMember(knownUser))) {
            await appendAuditLog('login_blocked_non_member', sessionUser, sessionUser);
            clearSessionCookie(req, res);
            log(`Jellyfin ${source} login blocked for ${sessionUser.username}: not a portal member`);
            return res.status(403).json({ error: 'Your account is not registered for this portal.' });
        }

        if (isAdmin) {
            const ensured = ensureAdminPortalUser(users, sessionUser);
            users = ensured.users;
            knownUser = ensured.user;
            if (knownUser) knownUser.lastLogin = new Date().toISOString();
            if (ensured.changed || knownUser) await saveFile(USERS_PATH, users);
            if (ensured.created) {
                await appendAuditLog('admin_portal_user_ensured', sessionUser, ensured.user).catch(() => {});
            }
        } else if (knownUser) {
            knownUser.lastLogin = new Date().toISOString();
            if (!knownUser.jellyfinId && sessionUser.jellyfinId) knownUser.jellyfinId = sessionUser.jellyfinId;
            await saveFile(USERS_PATH, users);
        }

        const token = signSessionJwt(jwt, sessionUser, JWT_SECRET, { expiresIn: '7d' });
        setSessionCookie(req, res, token);
        await appendAuditLog('user_login', sessionUser, sessionUser);
        log(`Jellyfin ${source} login success for ${sessionUser.username} (admin=${isAdmin}, secureCookie=${FORCE_SECURE_COOKIES}, token=${accessToken ? 'received' : 'missing'})`);
        return res.json({ success: true, user: { username: sessionUser.username, jellyfinId: sessionUser.jellyfinId, isAdmin } });
    };
};
