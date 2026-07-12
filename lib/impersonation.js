export const isImpersonatingSession = (sessionUser) => (
    !!(sessionUser?.actor && sessionUser?.impersonatingUserId)
);

export const getSessionActor = (sessionUser) => (
    isImpersonatingSession(sessionUser) ? sessionUser.actor : sessionUser
);

export const blockIfImpersonating = (req, res) => {
    if (!isImpersonatingSession(req.user)) return false;
    res.status(403).json({ error: 'This action is disabled while viewing as another user.' });
    return true;
};

export const buildImpersonationSessionUser = (actor, targetUser, config = {}) => {
    const isJellyfin = String(config.mediaServerType || '').toLowerCase() === 'jellyfin';
    return {
        id: targetUser.id,
        plexId: targetUser.plexId || targetUser.id,
        jellyfinId: targetUser.jellyfinId || null,
        email: targetUser.email || '',
        username: targetUser.username,
        thumb: targetUser.thumb || null,
        authProvider: isJellyfin ? 'jellyfin' : actor.authProvider,
        isAdmin: false,
        actor: {
            id: actor.id,
            plexId: actor.plexId || null,
            jellyfinId: actor.jellyfinId || null,
            authProvider: actor.authProvider,
            username: actor.username,
            email: actor.email || '',
            thumb: actor.thumb || null,
            jellyfinIsAdmin: actor.jellyfinIsAdmin,
            isAdmin: true,
        },
        impersonatingUserId: targetUser.id,
    };
};

export const buildAdminSessionFromActor = (actor) => ({
    id: actor.id,
    plexId: actor.plexId || null,
    jellyfinId: actor.jellyfinId || null,
    authProvider: actor.authProvider,
    username: actor.username,
    email: actor.email || '',
    thumb: actor.thumb || null,
    jellyfinIsAdmin: actor.jellyfinIsAdmin,
    isAdmin: true,
});
