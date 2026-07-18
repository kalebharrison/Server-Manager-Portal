export const portalPlexId = (portalUser = {}) => {
    const plexId = portalUser.plexId || portalUser.id;
    if (plexId == null || plexId === '') return '';
    const raw = String(plexId);
    if (raw.startsWith('jellyfin:')) return '';
    return raw;
};

export const portalJellyfinId = (portalUser = {}) => {
    if (portalUser.jellyfinId) return String(portalUser.jellyfinId);
    const raw = String(portalUser.id || '');
    return raw.startsWith('jellyfin:') ? raw.slice('jellyfin:'.length) : '';
};

export const findRequestAppUser = (users, portalUser = {}) => {
    const email = String(portalUser.email || '').trim().toLowerCase();
    const username = String(portalUser.username || '').trim().toLowerCase();
    const plexId = portalPlexId(portalUser);
    const jellyfinId = portalJellyfinId(portalUser).replace(/-/g, '').toLowerCase();
    return users.find((user) => {
        if (plexId && String(user.plexId || '') === plexId) return true;
        if (jellyfinId) {
            const candidate = String(user.jellyfinUserId || '').replace(/-/g, '').toLowerCase();
            if (candidate && candidate === jellyfinId) return true;
        }
        if (email && String(user.email || '').toLowerCase() === email) return true;
        if (username && String(user.username || user.displayName || '').toLowerCase() === username) return true;
        return false;
    }) || null;
};
