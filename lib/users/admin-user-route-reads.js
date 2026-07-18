import { getDeletedUserKey } from './deleted-users.js';

export const registerAdminUserReadRoutes = ({
    app,
    requireAdmin,
    usersPath,
    deletedUsersPath,
    auditLogPath,
    loadFile,
    saveFile,
    appendAuditLog,
}) => {
    app.get('/api/users', requireAdmin, async (req, res) => {
        const users = await loadFile(usersPath, []);
        res.json(users);
    });

    app.get('/api/deleted-users', requireAdmin, async (req, res) => {
        const deletedUsers = await loadFile(deletedUsersPath, []);
        res.json(deletedUsers.map(user => ({ ...user, blockId: getDeletedUserKey(user) })));
    });

    app.delete('/api/deleted-users/:blockId', requireAdmin, async (req, res) => {
        const { blockId } = req.params;
        const deletedUsers = await loadFile(deletedUsersPath, []);
        const deletedUser = deletedUsers.find(user => getDeletedUserKey(user) === blockId);
        if (!deletedUser) return res.status(404).json({ error: 'Deleted user record not found.' });

        await saveFile(deletedUsersPath, deletedUsers.filter(user => getDeletedUserKey(user) !== blockId));
        await appendAuditLog('deleted_user_unblocked', req.user, deletedUser);
        res.status(204).send();
    });

    app.get('/api/audit-log', requireAdmin, async (req, res) => {
        const auditLog = await loadFile(auditLogPath, []);
        res.json(auditLog.slice(0, 200));
    });
};
