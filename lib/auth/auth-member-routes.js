import fsSync from 'fs';
import jwt from 'jsonwebtoken';

import { normalized } from '../users/deleted-users.js';
import { blockIfImpersonating } from './impersonation.js';
import { verifySessionJwt } from './jwt-session.js';
import { applyAccountPreferencePatch } from '../users/user-profile.js';
import { buildCurrentUserPayload } from './current-user-payload.js';

export const registerAuthMemberRoutes = ({
    app,
    requireAuth,
    requireMember,
    requireAdmin,
    publicReadRateLimit,
    configPath,
    usersPath,
    deletedUsersPath,
    jwtSecret,
    loadFile,
    saveFile,
    clearSessionCookie,
    appendAuditLog,
    findLocalUserForSession,
    resolveCurrentAdmin,
    resolveConfiguredPlexServerUrl,
    getPlexConnectionUri,
    resolveLocalPlexAccountId,
    fetchPlexServerAccounts,
    getAdminProfile,
    isPortalConfigured,
    getClientId,
    appVersion,
    forceSecureCookies,
    log,
}) => {
    app.get('/api/auth/diagnostics', requireAdmin, async (req, res) => {
        const config = await loadFile(configPath, {});
        const clientId = getClientId();
        res.json({
            appVersion,
            forceSecureCookies,
            configured: isPortalConfigured(config),
            hasAdminPlexId: !!config?.adminPlexId,
            plexServerUrlConfigured: !!resolveConfiguredPlexServerUrl(config),
            dockerRuntime: fsSync.existsSync('/.dockerenv'),
            clientId: clientId ? `${String(clientId).slice(0, 8)}…` : null,
        });
    });

    app.get('/api/auth/session', publicReadRateLimit, async (req, res) => {
        const token = req.cookies?.session;
        if (!token) return res.json({ authenticated: false });
        try {
            const user = verifySessionJwt(jwt, token, jwtSecret);
            const config = await loadFile(configPath, {});
            const isAdmin = await resolveCurrentAdmin(user, config);
            return res.json({
                authenticated: true,
                user: {
                    username: user.username,
                    plexId: user.plexId,
                    jellyfinId: user.jellyfinId,
                    authProvider: user.authProvider || 'plex',
                    isAdmin,
                },
            });
        } catch {
            return res.json({ authenticated: false, reason: 'invalid_token' });
        }
    });

    app.post('/api/auth/logout', requireAuth, (req, res) => {
        clearSessionCookie(req, res);
        res.json({ message: 'Logged out' });
    });

    app.post('/api/users/preferences', requireAuth, requireMember, async (req, res) => {
        if (blockIfImpersonating(req, res)) return;
        try {
            const users = await loadFile(usersPath, []);
            const localUser = findLocalUserForSession(users, req.user);
            const userIndex = localUser ? users.findIndex(u => normalized(u.id) === normalized(localUser.id)) : -1;

            if (userIndex === -1) {
                return res.status(404).json({ error: 'User not found' });
            }

            const previousNewsletter = users[userIndex].newsletterOptIn === true;
            const { changed, errors } = applyAccountPreferencePatch(users[userIndex], req.body || {});
            if (errors.length) {
                return res.status(400).json({ error: errors[0] });
            }

            if (changed) {
                await saveFile(usersPath, users);
                const nextNewsletter = users[userIndex].newsletterOptIn === true;
                if (previousNewsletter !== nextNewsletter) {
                    await appendAuditLog(nextNewsletter ? 'newsletter_opt_in' : 'newsletter_opt_out', req.user, req.user);
                }
            }

            res.json({ success: true, user: users[userIndex] });
        } catch (e) {
            log(`Error updating preferences: ${e.message}`);
            res.status(500).json({ error: 'Failed to update preferences' });
        }
    });

    app.get('/api/users/me', requireAuth, async (req, res) => {
        const result = await buildCurrentUserPayload({
            req,
            res,
            usersPath,
            deletedUsersPath,
            configPath,
            loadFile,
            saveFile,
            clearSessionCookie,
            appendAuditLog,
            findLocalUserForSession,
            resolveCurrentAdmin,
            getAdminProfile,
            getPlexConnectionUri,
            resolveLocalPlexAccountId,
            fetchPlexServerAccounts,
        });
        return res.status(result.status).json(result.body);
    });
};
