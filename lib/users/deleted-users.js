import { randomUUID } from 'crypto';

export const normalized = (value) => value ? value.toString().trim().toLowerCase() : '';

export const isDeletedUser = (deletedUsers, user) => {
    const ids = [
        normalized(user.id),
        normalized(user.plexId),
        normalized(user.jellyfinId)
    ].filter(Boolean);
    const email = normalized(user.email);
    const username = normalized(user.username);

    return deletedUsers.some(deletedUser => {
        const deletedIds = [
            normalized(deletedUser.id),
            normalized(deletedUser.plexId),
            normalized(deletedUser.jellyfinId)
        ].filter(Boolean);

        return (
            ids.some(id => deletedIds.includes(id)) ||
            (email && email === normalized(deletedUser.email)) ||
            (username && username === normalized(deletedUser.username))
        );
    });
};

export const getDeletedUserKey = (deletedUser) => deletedUser.blockId || deletedUser.id || deletedUser.plexId || deletedUser.email || deletedUser.username;

export const createDeletedUserRegistry = ({ deletedUsersPath, loadFile, saveFile }) => {
    return {
        rememberDeletedUser: async (user, deletedBy) => {
            const deletedUsers = await loadFile(deletedUsersPath, []);
            if (!isDeletedUser(deletedUsers, user)) {
                deletedUsers.push({
                    blockId: randomUUID(),
                    id: user.id,
                    plexId: user.plexId || user.id,
                    jellyfinId: user.jellyfinId || null,
                    username: user.username,
                    email: user.email,
                    deletedAt: new Date().toISOString(),
                    deletedBy: deletedBy?.username || deletedBy?.email || 'admin'
                });
                await saveFile(deletedUsersPath, deletedUsers);
            }
        },
    };
};
