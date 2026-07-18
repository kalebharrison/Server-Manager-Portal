import { registerAdminUserReadRoutes } from './admin-user-route-reads.js';
import { registerAdminUserWriteRoutes } from './admin-user-route-writes.js';

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
    membershipSync = null,
    log,
}) => {
    registerAdminUserReadRoutes({
        app,
        requireAdmin,
        usersPath,
        deletedUsersPath,
        auditLogPath,
        loadFile,
        saveFile,
        appendAuditLog,
    });

    registerAdminUserWriteRoutes({
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
        membershipSync,
        log,
    });
};
