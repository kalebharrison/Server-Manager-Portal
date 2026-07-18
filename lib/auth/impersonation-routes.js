import jwt from 'jsonwebtoken';

import { isDeletedUser, normalized } from '../users/deleted-users.js';
import {
    buildAdminSessionFromActor,
    buildImpersonationSessionUser,
    getSessionActor,
    isImpersonatingSession,
} from './impersonation.js';
import { signSessionJwt } from './jwt-session.js';

export const registerImpersonationRoutes = ({
    app,
    requireAuth,
    requireAdmin,
    adminSensitiveRateLimit = (req, res, next) => next(),
    configPath,
    usersPath,
    deletedUsersPath,
    jwtSecret,
    loadFile,
    setSessionCookie,
    appendAuditLog,
    resolveCurrentAdmin,
    log,
}) => {
    if (!jwtSecret) throw new Error('Impersonation routes require jwtSecret.');

    app.post('/api/admin/impersonate/:userId', requireAdmin, adminSensitiveRateLimit, async (req, res) => {
        try {
            const [config, users, deletedUsers] = await Promise.all([
                loadFile(configPath, {}),
                loadFile(usersPath, []),
                loadFile(deletedUsersPath, []),
            ]);
            const actor = getSessionActor(req.user);
            const targetUser = users.find((user) => normalized(user.id) === normalized(req.params.userId));
            if (!targetUser) return res.status(404).json({ error: 'User not found.' });
            if (isDeletedUser(deletedUsers, targetUser)) {
                return res.status(400).json({ error: 'Cannot view the portal as a removed user.' });
            }

            const targetIsAdmin = await resolveCurrentAdmin({
                plexId: targetUser.plexId || targetUser.id,
                jellyfinId: targetUser.jellyfinId,
                authProvider: String(config.mediaServerType || '').toLowerCase() === 'jellyfin' ? 'jellyfin' : undefined,
                username: targetUser.username,
            }, config);
            if (targetIsAdmin) return res.status(403).json({ error: 'Cannot impersonate an administrator account.' });

            const sessionUser = buildImpersonationSessionUser(actor, targetUser, config);
            setSessionCookie(req, res, signSessionJwt(jwt, sessionUser, jwtSecret, { expiresIn: '1h' }), { maxAgeMs: 60 * 60 * 1000 });
            await appendAuditLog('impersonation_start', actor, targetUser);
            res.json({ success: true, targetUsername: targetUser.username });
        } catch (error) {
            log(`Impersonation start failed: ${error.message}`);
            res.status(500).json({ error: 'Failed to start impersonation.' });
        }
    });

    app.post('/api/admin/stop-impersonation', requireAuth, async (req, res) => {
        try {
            if (!isImpersonatingSession(req.user)) return res.json({ success: true, alreadyStopped: true });
            const actor = req.user.actor;
            if (!actor?.id && !actor?.plexId && !actor?.jellyfinId) {
                return res.status(403).json({ error: 'Invalid impersonation session.' });
            }
            const config = await loadFile(configPath, {});
            const stillAdmin = await resolveCurrentAdmin({
                plexId: actor.plexId || actor.id,
                jellyfinId: actor.jellyfinId,
                authProvider: actor.authProvider,
                username: actor.username,
            }, config);
            if (!stillAdmin) {
                return res.status(403).json({ error: 'Administrator session could not be restored.' });
            }

            // Never extend a stolen 1h impersonation cookie into a fresh 7d admin session.
            const remainingMs = Math.max(
                60_000,
                Math.min(((Number(req.user.exp) || 0) * 1000) - Date.now(), 60 * 60 * 1000),
            );
            const expiresInSec = Math.max(60, Math.ceil(remainingMs / 1000));
            const target = { id: req.user.impersonatingUserId, username: req.user.username };
            setSessionCookie(
                req,
                res,
                signSessionJwt(jwt, buildAdminSessionFromActor(actor), jwtSecret, { expiresIn: expiresInSec }),
                { maxAgeMs: remainingMs },
            );
            await appendAuditLog('impersonation_stop', actor, target);
            res.json({ success: true });
        } catch (error) {
            log(`Impersonation stop failed: ${error.message}`);
            res.status(500).json({ error: 'Failed to stop impersonation.' });
        }
    });
};
