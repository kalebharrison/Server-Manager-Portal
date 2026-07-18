import { createPlexUserSync } from './media-user-plex-sync.js';
import { createPlexUserAccess } from './media-user-plex-access.js';

export const createPlexUserOps = ({
    plexApi,
    usersPath,
    deletedUsersPath,
    loadFile,
    saveFile,
    apiFetch,
    isDeletedUser,
    ensureRequestAppMembership,
    ensureActiveRequestAppMembership,
    removeRequestAppMembership,
    appendAuditLog,
    log,
}) => {
    const { syncUsers } = createPlexUserSync({
        plexApi,
        usersPath,
        deletedUsersPath,
        loadFile,
        saveFile,
        apiFetch,
        isDeletedUser,
        ensureRequestAppMembership,
        ensureActiveRequestAppMembership,
        removeRequestAppMembership,
        appendAuditLog,
        log,
    });

    const { revokePlexAccess, inviteUserToPlex } = createPlexUserAccess({
        plexApi,
        apiFetch,
        log,
    });

    return {
        syncUsers,
        revokePlexAccess,
        inviteUserToPlex,
    };
};
