import fs from 'fs/promises';
import path from 'path';
import { createPlexUserOps } from './media-user-plex.js';
import { createJellyfinUserOps } from './media-user-jellyfin.js';

export const createMediaUserService = ({
    plexApi,
    usersPath,
    deletedUsersPath,
    loadFile,
    saveFile,
    apiFetch,
    fetchWithTimeout,
    resolveIntegrationUrlForFetch,
    jellyfinHeaders,
    isJellyfinConfigured,
    withBasePath,
    isDeletedUser,
    addDays,
    getDaysUntilExpiry,
    sendExpiryEmail,
    appendAuditLog,
    membershipSync = null,
    log,
}) => {
    const ensureRequestAppMembership = (user, config) => {
        if (!membershipSync?.ensure || !user) return;
        Promise.resolve(membershipSync.ensure(user, config)).catch((error) => {
            log(`Request app membership ensure skipped: ${error.message}`);
        });
    };
    const ensureActiveRequestAppMembership = (users, config) => {
        if (!membershipSync?.ensureActive || !users?.length) return;
        Promise.resolve(membershipSync.ensureActive(users, config)).catch((error) => {
            log(`Request app membership backfill skipped: ${error.message}`);
        });
    };
    const removeRequestAppMembership = (user, config) => {
        if (!membershipSync?.remove || !user) return;
        Promise.resolve(membershipSync.remove(user, config)).catch((error) => {
            log(`Request app membership remove skipped: ${error.message}`);
        });
    };

    const membershipDeps = {
        ensureRequestAppMembership,
        ensureActiveRequestAppMembership,
        removeRequestAppMembership,
    };

    const { syncUsers, revokePlexAccess, inviteUserToPlex } = createPlexUserOps({
        plexApi,
        usersPath,
        deletedUsersPath,
        loadFile,
        saveFile,
        apiFetch,
        isDeletedUser,
        appendAuditLog,
        log,
        ...membershipDeps,
    });

    const { syncJellyfinUsers } = createJellyfinUserOps({
        usersPath,
        deletedUsersPath,
        loadFile,
        saveFile,
        fetchWithTimeout,
        resolveIntegrationUrlForFetch,
        jellyfinHeaders,
        isJellyfinConfigured,
        withBasePath,
        isDeletedUser,
        addDays,
        appendAuditLog,
        log,
        ...membershipDeps,
    });

    const checkAndRevoke = async (config) => {
        log('Running periodic check for expired users...');
        const users = await loadFile(usersPath, []);
        const expiredUsers = users.filter(u => {
            const days = getDaysUntilExpiry(u.expiryDate);
            return u.plexAccessStatus !== 'revoked' && days !== null && days < 0;
        });

        if (expiredUsers.length === 0) {
            log('No expired users found.');
            return;
        }

        // Check if logo exists for email template
        const logoPath = path.join(process.cwd(), 'static', 'logo.png');
        let hasLogo = false;
        try {
            await fs.access(logoPath);
            hasLogo = true;
        } catch (e) { }

        log(`Found ${expiredUsers.length} expired user(s).`);
        let usersModified = false;
        for (const user of expiredUsers) {
            const revoked = await revokePlexAccess(user, config);
            if (revoked) {
                const userInList = users.find(u => u.id === user.id);
                if (userInList) {
                    userInList.plexAccessStatus = 'revoked';
                    usersModified = true;
                    removeRequestAppMembership(userInList, config);

                    // Send expiry notification email if not already sent
                    if (!userInList.expiryEmailSent) {
                        const emailSent = await sendExpiryEmail(config, userInList, hasLogo);
                        if (emailSent) {
                            userInList.expiryEmailSent = true;
                        }
                    }
                }
            }
        }

        if (usersModified) {
            await saveFile(usersPath, users);
            log('Updated local user file with revocation status.');
        }
    };

    return {
        syncUsers,
        syncJellyfinUsers,
        revokePlexAccess,
        inviteUserToPlex,
        checkAndRevoke,
    };
};
