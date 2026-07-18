export const createPlexUserAccess = ({
    plexApi,
    apiFetch,
    log,
}) => {
    const revokePlexAccess = async (user, config) => {
        const plexUserId = user.plexId || user.id;
        if (!plexUserId || !config.serverIdentifier) {
            log(`Error: Cannot revoke access for ${user.username} due to missing user ID or server ID.`);
            return false;
        }
        log(`Revoking Plex access for expired user: ${user.username} (ID: ${plexUserId})`);

        try {
            const usersListRes = await apiFetch(
                `${plexApi}/users`,
                config.plexToken
            );

            if (!usersListRes.ok) {
                await usersListRes.text();
                log(`Error fetching Plex users list for revocation. Status: ${usersListRes.status}.`);
                return false;
            }

            const xmlText = await usersListRes.text();

            const userBlockRegex = new RegExp(`<User\\b[^>]*id="${plexUserId}"[^>]*>.*?<\\/User>`, 's');
            const userBlockMatch = xmlText.match(userBlockRegex);

            if (!userBlockMatch) {
                log(`User ${user.username} not found in friends list. Assuming already revoked.`);
                return true;
            }

            const serverTagRegex = new RegExp(`<Server\\b[^>]*machineIdentifier="${config.serverIdentifier}"[^>]*>`);
            const serverTagMatch = userBlockMatch[0].match(serverTagRegex);

            if (!serverTagMatch) {
                log(`User ${user.username} does not have access to server ${config.serverIdentifier}. Assuming already revoked.`);
                return true;
            }

            const shareIdMatch = serverTagMatch[0].match(/id="([^"]+)"/);
            if (!shareIdMatch || !shareIdMatch[1]) {
                log(`Could not find share ID for user ${user.username} on server ${config.serverIdentifier}.`);
                return false;
            }
            const shareId = shareIdMatch[1];

            const res = await apiFetch(
                `https://plex.tv/api/servers/${config.serverIdentifier}/shared_servers/${shareId}`,
                config.plexToken,
                {
                    method: 'DELETE'
                }
            );

            if (!res.ok) {
                await res.text();
                log(`Failed to revoke access for ${user.username}. Status: ${res.status}.`);
                return false;
            }

            log(`Successfully revoked access for ${user.username}.`);
            return true;

        } catch (error) {
            log(`An exception occurred while revoking access for ${user.username}: ${error.message}`);
            return false;
        }
    };

    const inviteUserToPlex = async (user, config, libraryIds = null) => {
        if (!user.email || !config.serverIdentifier) {
            log(`Error: Cannot invite ${user.username} due to missing email or server ID.`);
            return false;
        }
        log(`Inviting user to Plex: ${user.username} (${user.email})`);
        try {
            const sharedServer = { invited_email: user.email };
            if (libraryIds && Array.isArray(libraryIds) && libraryIds.length > 0) {
                sharedServer.library_section_ids = libraryIds;
            }

            const inviteRes = await apiFetch(`https://plex.tv/api/servers/${config.serverIdentifier}/shared_servers`, config.plexToken, {
                method: 'POST',
                body: JSON.stringify({
                    server_id: config.serverIdentifier,
                    shared_server: sharedServer
                }),
                headers: { 'Content-Type': 'application/json' }
            });

            if (!inviteRes.ok) {
                const errText = await inviteRes.text();
                log(`Note: Plex API returned an error during invite (${inviteRes.status}): ${errText}`);
                return false;
            }
            return true;
        } catch (error) {
            log(`An exception occurred while inviting user ${user.username}: ${error.message}`);
            return false;
        }
    };

    return {
        revokePlexAccess,
        inviteUserToPlex,
    };
};
