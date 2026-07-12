import jwt from 'jsonwebtoken';

import { isDeletedUser, normalized } from './deleted-users.js';
import {
    buildAdminSessionFromActor,
    buildImpersonationSessionUser,
    getSessionActor,
    isImpersonatingSession,
} from './impersonation.js';

export const registerImpersonationRoutes = ({
    app,
    requireAuth,
    requireAdmin,
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

    app.post('/api/admin/impersonate/:userId', requireAdmin, async (req, res) => {
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
            setSessionCookie(req, res, jwt.sign(sessionUser, jwtSecret, { expiresIn: '1h' }), { maxAgeMs: 60 * 60 * 1000 });
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
            const target = { id: req.user.impersonatingUserId, username: req.user.username };
            setSessionCookie(req, res, jwt.sign(buildAdminSessionFromActor(actor), jwtSecret, { expiresIn: '7d' }));
            await appendAuditLog('impersonation_stop', actor, target);
            res.json({ success: true });
        } catch (error) {
            log(`Impersonation stop failed: ${error.message}`);
            res.status(500).json({ error: 'Failed to stop impersonation.' });
        }
    });
};
