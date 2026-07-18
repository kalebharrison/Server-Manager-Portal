import { getDaysUntilExpiry } from './date-utils.js';
import { isDeletedUser } from './deleted-users.js';
import { blockIfImpersonating } from './impersonation.js';

export const registerMemberAccessRoutes = ({
    app,
    requireAuth,
    requireMember,
    configPath,
    usersPath,
    deletedUsersPath,
    loadFile,
    saveFile,
    appendAuditLog,
    inviteUserToPlex,
    clearSessionCookie,
    log,
}) => {
    const CONFIG_PATH = configPath;
    const USERS_PATH = usersPath;
    const DELETED_USERS_PATH = deletedUsersPath;

    // Open self-serve temporary access was removed. Timed membership is invite/referral only.
    app.post('/api/users/request-invite', requireAuth, async (req, res) => {
        await appendAuditLog('trial_request_disabled', req.user, req.user);
        return res.status(410).json({ error: 'Open temporary access registration is disabled. Ask an admin for an invite.' });
    });

    app.post('/api/users/relink', requireAuth, requireMember, async (req, res) => {
        if (blockIfImpersonating(req, res)) return;
        const config = await loadFile(CONFIG_PATH, null);
        if (!config || !config.serverIdentifier) return res.status(400).json({ error: 'App not configured.' });

        let users = await loadFile(USERS_PATH, []);
        const user = users.find(u => u.email === req.user.email || u.username === req.user.username);
        const deletedUsers = await loadFile(DELETED_USERS_PATH, []);

        if (!user && !req.user.isAdmin && isDeletedUser(deletedUsers, req.user)) {
            await appendAuditLog('relink_blocked_deleted_user', req.user, req.user);
            clearSessionCookie(req, res);
            return res.status(403).json({ error: 'Your portal session has expired. Please contact the admin for access.' });
        }
        if (!user) {
            await appendAuditLog('relink_failed_user_not_found', req.user, req.user);
            return res.status(404).json({ error: 'User not found.' });
        }

        const days = getDaysUntilExpiry(user.expiryDate);
        if (days === null || days < 0) {
            await appendAuditLog('relink_blocked_expired', req.user, user, { days });
            return res.status(400).json({ error: 'Your access has expired.' });
        }

        try {
            log(`Re-linking user ${user.username}...`);
            await inviteUserToPlex(user, config, config.defaultLibraryIds).catch(e => log('Failed to re-link user: ' + e.message));

            user.plexAccessStatus = 'pending';
            await saveFile(USERS_PATH, users);
            await appendAuditLog('relink_invite_sent', req.user, user);

            res.json({ message: 'Account re-linked successfully.', user });
        } catch (e) {
            log('Error re-linking account: ' + e.message);
            res.status(500).json({ error: 'Failed to re-link account.' });
        }
    });
};
