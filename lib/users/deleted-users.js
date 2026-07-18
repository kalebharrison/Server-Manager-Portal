import { randomUUID } from 'crypto';

export const normalized = (value) => (value ? value.toString().trim().toLowerCase() : '');

/** Build O(1) lookup sets from a deleted-users array. */
export const buildDeletedUserIndex = (deletedUsers = []) => {
    const ids = new Set();
    const emails = new Set();
    const usernames = new Set();
    if (!Array.isArray(deletedUsers)) return { ids, emails, usernames };
    for (const deletedUser of deletedUsers) {
        for (const value of [deletedUser?.id, deletedUser?.plexId, deletedUser?.jellyfinId]) {
            const key = normalized(value);
            if (key) ids.add(key);
        }
        const email = normalized(deletedUser?.email);
        if (email) emails.add(email);
        const username = normalized(deletedUser?.username);
        if (username) usernames.add(username);
    }
    return { ids, emails, usernames };
};

export const isDeletedUser = (deletedUsers, user) => {
    if (!user) return false;
    const index = Array.isArray(deletedUsers)
        ? buildDeletedUserIndex(deletedUsers)
        : (deletedUsers?.ids instanceof Set ? deletedUsers : buildDeletedUserIndex([]));

    for (const value of [user.id, user.plexId, user.jellyfinId]) {
        const key = normalized(value);
        if (key && index.ids.has(key)) return true;
    }
    const email = normalized(user.email);
    if (email && index.emails.has(email)) return true;
    const username = normalized(user.username);
    if (username && index.usernames.has(username)) return true;
    return false;
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
                    deletedBy: deletedBy?.username || deletedBy?.email || 'admin',
                });
                await saveFile(deletedUsersPath, deletedUsers);
            }
        },
    };
};
