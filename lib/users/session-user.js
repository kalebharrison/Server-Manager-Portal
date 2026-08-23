import { normalized } from './deleted-users.js';

export const findLocalUserForSession = (users, sessionUser) => {
    if (!sessionUser || !Array.isArray(users)) return null;
    if (sessionUser.impersonatingUserId) {
        const target = users.find((user) => normalized(user.id) === normalized(sessionUser.impersonatingUserId));
        if (target) return target;
    }
    const sessionId = normalized(sessionUser.id);
    const sessionPlexId = normalized(sessionUser.plexId);
    const sessionJellyfinId = normalized(sessionUser.jellyfinId);
    const sessionEmail = normalized(sessionUser.email);
    return users.find((user) => {
        const userId = normalized(user.id);
        const userPlexId = normalized(user.plexId);
        const userJellyfinId = normalized(user.jellyfinId);
        const userEmail = normalized(user.email);
        return (
            (sessionPlexId && (sessionPlexId === userPlexId || sessionPlexId === userId)) ||
            (sessionJellyfinId && (sessionJellyfinId === userJellyfinId || sessionJellyfinId === userId)) ||
            (sessionId && (sessionId === userId || sessionId === userPlexId)) ||
            (sessionId && (sessionId === userJellyfinId || sessionId === `jellyfin:${userJellyfinId}`)) ||
            (sessionEmail && sessionEmail === userEmail)
        );
    }) || null;
};

/**
 * Resolve a users.json row from a bare id (portal id, plexId, jellyfinId, or Plex
 * account uuid embedded in the avatar thumb URL). Used by request resolveUser().
 */
export const findLocalUserById = (users, id) => {
    if (!Array.isArray(users)) return null;
    const key = normalized(id);
    if (!key) return null;
    return users.find((user) => {
        const userId = normalized(user.id);
        const userPlexId = normalized(user.plexId);
        const userJellyfinId = normalized(user.jellyfinId);
        const thumb = String(user.thumb || '');
        return (
            key === userId
            || key === userPlexId
            || key === userJellyfinId
            || key === `jellyfin:${userJellyfinId}`
            || (thumb.includes(`/users/${key}/`))
            || (thumb.includes(key) && key.length >= 8)
        );
    }) || null;
};
