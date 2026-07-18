import fs from 'fs/promises';
import path from 'path';

import { addMonths, addYears, getDaysUntilExpiry } from './date-utils.js';
import { getDeletedUserKey } from './deleted-users.js';

export const registerAdminUserRoutes = ({
    app,
    requireAdmin,
    configPath,
    usersPath,
    deletedUsersPath,
    auditLogPath,
    loadFile,
    saveFile,
    appendAuditLog,
    sendAdjustmentEmail,
    inviteUserToPlex,
    revokePlexAccess,
    rememberDeletedUser,
    log,
}) => {
    const CONFIG_PATH = configPath;
    const USERS_PATH = usersPath;
    const DELETED_USERS_PATH = deletedUsersPath;
    const AUDIT_LOG_PATH = auditLogPath;

    const reconcileTrialAccessFlag = (user) => {
        if (!user?.isTrial) return false;
        const days = getDaysUntilExpiry(user.expiryDate);
        if (days === null || days > 3) {
            user.isTrial = false;
            return true;
        }
        return false;
    };

    // User data endpoints
    app.get('/api/users', requireAdmin, async (req, res) => {
        const users = await loadFile(USERS_PATH, []);
        res.json(users);
    });

    app.get('/api/deleted-users', requireAdmin, async (req, res) => {
        const deletedUsers = await loadFile(DELETED_USERS_PATH, []);
        res.json(deletedUsers.map(user => ({ ...user, blockId: getDeletedUserKey(user) })));
    });

    app.delete('/api/deleted-users/:blockId', requireAdmin, async (req, res) => {
        const { blockId } = req.params;
        const deletedUsers = await loadFile(DELETED_USERS_PATH, []);
        const deletedUser = deletedUsers.find(user => getDeletedUserKey(user) === blockId);
        if (!deletedUser) return res.status(404).json({ error: 'Deleted user record not found.' });

        await saveFile(DELETED_USERS_PATH, deletedUsers.filter(user => getDeletedUserKey(user) !== blockId));
        await appendAuditLog('deleted_user_unblocked', req.user, deletedUser);
        res.status(204).send();
    });

    app.get('/api/audit-log', requireAdmin, async (req, res) => {
        const auditLog = await loadFile(AUDIT_LOG_PATH, []);
        res.json(auditLog.slice(0, 200));
    });

    app.put('/api/users/:id', requireAdmin, async (req, res) => {
        const { id } = req.params;
        const { expiryDate, exemptFromCleanup, newsletterOptIn } = req.body;
        let users = await loadFile(USERS_PATH, []);
        const userIndex = users.findIndex(u => u.id === id);
        if (userIndex === -1) return res.status(404).json({ error: 'User not found.' });

        const previousExpiryDate = users[userIndex].expiryDate;

        if (expiryDate !== undefined) {
            users[userIndex].expiryDate = expiryDate;
        }
        if (exemptFromCleanup !== undefined) {
            users[userIndex].exemptFromCleanup = !!exemptFromCleanup;
        }
        if (newsletterOptIn !== undefined) {
            users[userIndex].newsletterOptIn = !!newsletterOptIn;
            delete users[userIndex].optOutNewsletter;
        }
        reconcileTrialAccessFlag(users[userIndex]);

        await saveFile(USERS_PATH, users);

        if (expiryDate !== undefined && expiryDate !== previousExpiryDate) {
            await appendAuditLog('user_expiry_updated', req.user, users[userIndex], { previousExpiryDate, expiryDate });
            const config = await loadFile(CONFIG_PATH, {});
            const logoPath = path.join(process.cwd(), 'static', 'logo.png');
            let hasLogo = false;
            try { await fs.access(logoPath); hasLogo = true; } catch (e) { }
            await sendAdjustmentEmail(config, users[userIndex], hasLogo);

            if (users[userIndex].plexAccessStatus === 'revoked') {
                const days = getDaysUntilExpiry(users[userIndex].expiryDate);
                if (days === null || days >= 0) {
                    const invited = await inviteUserToPlex(users[userIndex], config, config.defaultLibraryIds);
                    if (invited) {
                        users[userIndex].plexAccessStatus = 'pending';
                        await saveFile(USERS_PATH, users);
                        await appendAuditLog('relink_invite_sent', req.user, users[userIndex]);
                    }
                }
            }
        }

        res.json(users[userIndex]);
    });

    const applyBulkAction = (user, action, customDate) => {
        const baseDate = user.expiryDate ? new Date(user.expiryDate) : new Date();

        switch (action) {
            case 'addMonth':
                user.expiryDate = addMonths(baseDate, 1).toISOString();
                break;
            case 'addYear':
                user.expiryDate = addYears(baseDate, 1).toISOString();
                break;
            case 'unlimited':
                user.expiryDate = null;
                break;
            case 'custom':
                user.expiryDate = customDate ? new Date(customDate).toISOString() : null;
                break;
        }
        reconcileTrialAccessFlag(user);
    };

    app.post('/api/users/bulk-update', requireAdmin, async (req, res) => {
        const { userIds, action, customDate } = req.body;
        if (!Array.isArray(userIds) || userIds.length === 0 || !['addMonth', 'addYear', 'unlimited', 'custom'].includes(action)) {
            return res.status(400).json({ error: 'Invalid request body.' });
        }
        if (action === 'custom' && !customDate) {
            return res.status(400).json({ error: 'customDate is required for custom action.' });
        }

        try {
            let users = await loadFile(USERS_PATH, []);
            let updatedCount = 0;
            const config = await loadFile(CONFIG_PATH, {});
            const logoPath = path.join(process.cwd(), 'static', 'logo.png');
            let hasLogo = false;
            try { await fs.access(logoPath); hasLogo = true; } catch (e) { }

            for (const user of users) {
                if (userIds.includes(user.id)) {
                    applyBulkAction(user, action, customDate);
                    updatedCount++;
                    await appendAuditLog('user_bulk_updated', req.user, user, { action, customDate: customDate || null });
                    await sendAdjustmentEmail(config, user, hasLogo);

                    if (user.plexAccessStatus === 'revoked') {
                        const days = getDaysUntilExpiry(user.expiryDate);
                        if (days === null || days >= 0) {
                            const invited = await inviteUserToPlex(user, config, config.defaultLibraryIds);
                            if (invited) {
                                user.plexAccessStatus = 'pending';
                                await appendAuditLog('relink_invite_sent', req.user, user);
                            }
                        }
                    }
                }
            }

            await saveFile(USERS_PATH, users);
            log(`Bulk updated ${updatedCount} users with action: ${action}`);
            res.json({ message: `Successfully updated ${updatedCount} users.` });
        } catch (error) {
            res.status(500).json({ error: 'Failed to process bulk update.' });
        }
    });

    app.delete('/api/users/:id', requireAdmin, async (req, res) => {
        const { id } = req.params;
        const config = await loadFile(CONFIG_PATH, null);
        let users = await loadFile(USERS_PATH, []);
        const user = users.find(u => u.id === id);
        if (!user) return res.status(404).json({ error: 'User not found.' });

        if (config && config.serverIdentifier && config.plexToken) {
            const revoked = await revokePlexAccess(user, config);
            if (!revoked) {
                return res.status(500).json({ error: 'Failed to revoke Plex access before deleting user.' });
            }
        }

        await rememberDeletedUser(user, req.user);
        await saveFile(USERS_PATH, users.filter(u => u.id !== id));
        await appendAuditLog('user_deleted_blocked', req.user, user, { plexAccessRevoked: !!(config && config.serverIdentifier && config.plexToken) });
        res.status(204).send();
    });

    app.post('/api/users/:id/revoke', requireAdmin, async (req, res) => {
        const { id } = req.params;
        const config = await loadFile(CONFIG_PATH, null);
        if (!config) return res.status(400).json({ error: 'App not configured.' });
        let users = await loadFile(USERS_PATH, []);
        const user = users.find(u => u.id === id);
        if (!user) return res.status(404).json({ error: 'User not found.' });

        const revoked = await revokePlexAccess(user, config);
        if (revoked) {
            user.plexAccessStatus = 'revoked';
            await saveFile(USERS_PATH, users);
            await appendAuditLog('plex_access_revoked', req.user, user);
            res.json(user);
        } else {
            res.status(500).json({ error: 'Failed to revoke access via Plex API.' });
        }
    });

};
