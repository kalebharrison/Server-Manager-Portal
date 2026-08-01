import fs from 'fs/promises';
import path from 'path';

import { applyBulkAction, maybeReinviteRevokedUser, reconcileTrialAccessFlag } from './admin-user-route-helpers.js';

export const registerAdminUserWriteRoutes = ({
    app,
    requireAdmin,
    configPath,
    usersPath,
    loadFile,
    saveFile,
    appendAuditLog,
    sendAdjustmentEmail,
    inviteUserToPlex,
    revokePlexAccess,
    rememberDeletedUser,
    log,
}) => {
    app.put('/api/users/:id', requireAdmin, async (req, res) => {
        const { id } = req.params;
        const { expiryDate, exemptFromCleanup, newsletterOptIn, requestOverrides } = req.body;
        let users = await loadFile(usersPath, []);
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
        if (requestOverrides !== undefined && requestOverrides !== null && typeof requestOverrides === 'object') {
            const existing = (users[userIndex].requestOverrides && typeof users[userIndex].requestOverrides === 'object')
                ? users[userIndex].requestOverrides
                : {};
            const next = { ...existing };
            for (const key of [
                'autoApproveMovies', 'autoApproveTv',
                'autoApproveMovies4k', 'autoApproveTv4k',
            ]) {
                if (requestOverrides[key] === null || requestOverrides[key] === undefined) {
                    delete next[key];
                } else if (typeof requestOverrides[key] === 'boolean') {
                    next[key] = requestOverrides[key];
                }
            }
            users[userIndex].requestOverrides = next;
        }
        reconcileTrialAccessFlag(users[userIndex]);

        await saveFile(usersPath, users);

        if (expiryDate !== undefined && expiryDate !== previousExpiryDate) {
            await appendAuditLog('user_expiry_updated', req.user, users[userIndex], { previousExpiryDate, expiryDate });
            const config = await loadFile(configPath, {});
            const logoPath = path.join(process.cwd(), 'static', 'logo.png');
            let hasLogo = false;
            try { await fs.access(logoPath); hasLogo = true; } catch (e) { }
            await sendAdjustmentEmail(config, users[userIndex], hasLogo);

            if (await maybeReinviteRevokedUser({
                user: users[userIndex],
                config,
                inviteUserToPlex,
                appendAuditLog,
                actor: req.user,
            })) {
                await saveFile(usersPath, users);
            }
        }

        res.json(users[userIndex]);
    });

    app.post('/api/users/bulk-update', requireAdmin, async (req, res) => {
        const { userIds, action, customDate } = req.body;
        if (!Array.isArray(userIds) || userIds.length === 0 || !['addMonth', 'addYear', 'unlimited', 'custom'].includes(action)) {
            return res.status(400).json({ error: 'Invalid request body.' });
        }
        if (action === 'custom' && !customDate) {
            return res.status(400).json({ error: 'customDate is required for custom action.' });
        }

        try {
            let users = await loadFile(usersPath, []);
            let updatedCount = 0;
            const config = await loadFile(configPath, {});
            const logoPath = path.join(process.cwd(), 'static', 'logo.png');
            let hasLogo = false;
            try { await fs.access(logoPath); hasLogo = true; } catch (e) { }

            const selectedIds = new Set(userIds.map((id) => String(id)));
            for (const user of users) {
                if (!selectedIds.has(String(user.id))) continue;
                applyBulkAction(user, action, customDate);
                updatedCount++;
                await appendAuditLog('user_bulk_updated', req.user, user, { action, customDate: customDate || null });
                await sendAdjustmentEmail(config, user, hasLogo);

                await maybeReinviteRevokedUser({
                    user,
                    config,
                    inviteUserToPlex,
                    appendAuditLog,
                    actor: req.user,
                });
            }

            await saveFile(usersPath, users);
            log(`Bulk updated ${updatedCount} users with action: ${action}`);
            res.json({ message: `Successfully updated ${updatedCount} users.` });
        } catch (error) {
            res.status(500).json({ error: 'Failed to process bulk update.' });
        }
    });

    app.delete('/api/users/:id', requireAdmin, async (req, res) => {
        const { id } = req.params;
        const config = await loadFile(configPath, null);
        let users = await loadFile(usersPath, []);
        const user = users.find(u => u.id === id);
        if (!user) return res.status(404).json({ error: 'User not found.' });
        const adminPlexId = String(config?.adminPlexId || '');
        if (user.isPortalAdmin === true || (adminPlexId && (String(user.plexId || '') === adminPlexId || String(user.id || '') === adminPlexId))) {
            return res.status(400).json({ error: 'Cannot delete the portal admin account.' });
        }

        if (config && config.serverIdentifier && config.plexToken) {
            const revoked = await revokePlexAccess(user, config);
            if (!revoked) {
                return res.status(500).json({ error: 'Failed to revoke Plex access before deleting user.' });
            }
        }
        await rememberDeletedUser(user, req.user);
        await saveFile(usersPath, users.filter(u => u.id !== id));
        await appendAuditLog('user_deleted_blocked', req.user, user, { plexAccessRevoked: !!(config && config.serverIdentifier && config.plexToken) });
        res.status(204).send();
    });

    app.post('/api/users/:id/revoke', requireAdmin, async (req, res) => {
        const { id } = req.params;
        const config = await loadFile(configPath, null);
        if (!config) return res.status(400).json({ error: 'App not configured.' });
        let users = await loadFile(usersPath, []);
        const user = users.find(u => u.id === id);
        if (!user) return res.status(404).json({ error: 'User not found.' });
        const adminPlexId = String(config?.adminPlexId || '');
        if (user.isPortalAdmin === true || (adminPlexId && (String(user.plexId || '') === adminPlexId || String(user.id || '') === adminPlexId))) {
            return res.status(400).json({ error: 'Cannot revoke the portal admin account.' });
        }

        const revoked = await revokePlexAccess(user, config);
        if (revoked) {
            user.plexAccessStatus = 'revoked';
            await saveFile(usersPath, users);
            await appendAuditLog('plex_access_revoked', req.user, user);
            res.json(user);
        } else {
            res.status(500).json({ error: 'Failed to revoke access via Plex API.' });
        }
    });
};
