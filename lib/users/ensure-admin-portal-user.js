import { findLocalUserForSession } from './session-user.js';

/**
 * Ensure the portal admin has a normal users.json row so Preferences / Discord ID work.
 * Admins historically authenticated without a member record (Plex owner / JF admin).
 */
export const ensureAdminPortalUser = (users, identity = {}) => {
    const list = Array.isArray(users) ? [...users] : [];
    const plexId = identity.plexId != null && identity.plexId !== '' ? String(identity.plexId) : '';
    const jellyfinId = identity.jellyfinId != null && identity.jellyfinId !== '' ? String(identity.jellyfinId) : '';
    const sessionId = identity.id != null && identity.id !== '' ? String(identity.id) : '';
    if (!plexId && !jellyfinId && !sessionId) {
        return { users: list, user: null, created: false, changed: false };
    }

    const lookup = {
        id: sessionId || plexId || (jellyfinId ? `jellyfin:${jellyfinId}` : ''),
        plexId: plexId || undefined,
        jellyfinId: jellyfinId || undefined,
        email: identity.email || undefined,
    };
    const existing = findLocalUserForSession(list, lookup);
    if (existing) {
        let changed = false;
        const status = String(existing.plexAccessStatus || '').toLowerCase();
        if (status === 'revoked' || status === 'expired' || status === 'pending' || !status) {
            existing.plexAccessStatus = 'active';
            changed = true;
        }
        if (plexId && !existing.plexId) {
            existing.plexId = plexId;
            changed = true;
        }
        if (jellyfinId && !existing.jellyfinId) {
            existing.jellyfinId = jellyfinId;
            changed = true;
        }
        if (identity.username && existing.username !== identity.username) {
            existing.username = identity.username;
            changed = true;
        }
        if (identity.email && existing.email !== identity.email) {
            existing.email = identity.email;
            changed = true;
        }
        if (identity.thumb && existing.thumb !== identity.thumb) {
            existing.thumb = identity.thumb;
            changed = true;
        }
        if (existing.expiryDate != null) {
            existing.expiryDate = null;
            changed = true;
        }
        if (existing.isPortalAdmin !== true) {
            existing.isPortalAdmin = true;
            changed = true;
        }
        return { users: list, user: existing, created: false, changed };
    }

    const created = {
        id: plexId || (jellyfinId ? `jellyfin:${jellyfinId}` : sessionId),
        username: identity.username || 'Admin',
        email: identity.email || '',
        thumb: identity.thumb || null,
        joiningDate: new Date().toISOString(),
        expiryDate: null,
        plexAccessStatus: 'active',
        isTrial: false,
        isPortalAdmin: true,
    };
    if (plexId) created.plexId = plexId;
    if (jellyfinId) created.jellyfinId = jellyfinId;

    list.push(created);
    return { users: list, user: created, created: true, changed: true };
};

export const isAdminPortalUser = (user, adminPlexId = '', adminJellyfinId = '') => {
    if (!user) return false;
    if (user.isPortalAdmin === true) return true;
    const plexId = adminPlexId ? String(adminPlexId) : '';
    const jellyfinId = adminJellyfinId ? String(adminJellyfinId) : '';
    if (plexId && (String(user.plexId || '') === plexId || String(user.id || '') === plexId)) return true;
    if (jellyfinId && (String(user.jellyfinId || '') === jellyfinId || String(user.id || '') === `jellyfin:${jellyfinId}`)) {
        return true;
    }
    return false;
};
