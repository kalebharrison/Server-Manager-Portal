/**
 * Arr requester / notify tags.
 * Write: one tag per linked media id — plex and/or jellyfin when both exist on the user.
 * Labels: {mediaUserId}-{username} and n-{mediaUserId}-{username}.
 * Read: either media-server id, legacy portal/Seerr prefixes, bare usernames, notify prefix.
 */

const norm = (value) => String(value || '').trim().toLowerCase();

/** Arr tag labels allow a-z0-9- only (newer *arr). */
export const sanitizeArrTagSegment = (value) => norm(value)
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

const usernameForTag = (user) => String(
    user?.username
    || user?.displayName
    || (user?.email ? String(user.email).split('@')[0] : '')
    || '',
).trim();

/**
 * All durable media ids for Arr tag writes (dual-player ready).
 * Includes plexId and/or jellyfinId when present; portal id only if neither is set.
 */
export const mediaUserIdsForTag = (user) => {
    const plexId = String(user?.plexId || '').trim();
    const jellyfinId = String(user?.jellyfinId || '').trim();
    const portalId = String(user?.id || '').trim();
    const ids = [];
    const seen = new Set();
    for (const id of [plexId, jellyfinId]) {
        if (!id) continue;
        const key = sanitizeArrTagSegment(id) || id.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        ids.push(id);
    }
    if (!ids.length && portalId) ids.push(portalId);
    return ids;
};

/**
 * Primary media-server id for display / single-tag helpers.
 * Active stack wins; fall back to the other id, then portal id — never invent one.
 */
export const mediaUserIdForTag = (user, mediaServerType = 'plex') => {
    const type = String(mediaServerType || 'plex').toLowerCase() === 'jellyfin' ? 'jellyfin' : 'plex';
    const ids = mediaUserIdsForTag(user);
    if (!ids.length) return '';
    const plexId = String(user?.plexId || '').trim();
    const jellyfinId = String(user?.jellyfinId || '').trim();
    if (type === 'jellyfin') {
        return (jellyfinId && ids.includes(jellyfinId) ? jellyfinId : null)
            || (plexId && ids.includes(plexId) ? plexId : null)
            || ids[0];
    }
    return (plexId && ids.includes(plexId) ? plexId : null)
        || (jellyfinId && ids.includes(jellyfinId) ? jellyfinId : null)
        || ids[0];
};

/**
 * Build `{id}-{username}` label (requester form, no notify prefix).
 * @param {string|number} userId
 * @param {string} username
 */
export const buildPortalRequesterTagLabel = (userId, username) => {
    const id = sanitizeArrTagSegment(userId);
    const user = sanitizeArrTagSegment(username);
    if (id && user) return `${id}-${user}`;
    return user || id || '';
};

/** All requester labels for linked media ids (plex + jellyfin when both exist). */
export const buildPortalRequesterTagsForUser = (user) => {
    const username = usernameForTag(user);
    const out = [];
    const seen = new Set();
    for (const id of mediaUserIdsForTag(user)) {
        const label = buildPortalRequesterTagLabel(id, username);
        if (!label || seen.has(label)) continue;
        seen.add(label);
        out.push(label);
    }
    return out;
};

/** All notify labels for linked media ids. */
export const buildNotifyTagsForUser = (user) => (
    buildPortalRequesterTagsForUser(user).map((label) => `n-${label}`)
);

/** Primary requester label (active media server preferred). */
export const buildPortalRequesterTagForUser = (user, mediaServerType = 'plex') => {
    const id = mediaUserIdForTag(user, mediaServerType);
    if (!id && !usernameForTag(user)) return '';
    return buildPortalRequesterTagLabel(id, usernameForTag(user));
};

/** Primary notify label (active media server preferred). */
export const buildNotifyTagForUser = (user, mediaServerType = 'plex') => {
    const requester = buildPortalRequesterTagForUser(user, mediaServerType);
    return requester ? `n-${requester}` : '';
};

const JELLYFIN_GUID_RE = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})-(.+)$/;
const NUMERIC_ID_RE = /^(\d+)-(.+)$/;

/**
 * Parse an Arr tag label into ownership / notify candidates.
 * @returns {{ idPrefix: string|null, username: string, bare: boolean, kind: 'requester'|'notify', raw: string }|null}
 */
export const parseArrRequesterTagLabel = (label) => {
    const raw = sanitizeArrTagSegment(label);
    if (!raw) return null;

    let kind = 'requester';
    let body = raw;
    if (body.startsWith('n-') && body.length > 2) {
        kind = 'notify';
        body = body.slice(2);
    }

    const guidMatch = body.match(JELLYFIN_GUID_RE);
    if (guidMatch) {
        return {
            idPrefix: guidMatch[1],
            username: sanitizeArrTagSegment(guidMatch[2]) || guidMatch[2],
            bare: false,
            kind,
            raw,
        };
    }

    const numMatch = body.match(NUMERIC_ID_RE);
    if (numMatch) {
        return {
            idPrefix: numMatch[1],
            username: sanitizeArrTagSegment(numMatch[2]) || numMatch[2],
            bare: false,
            kind,
            raw,
        };
    }

    return {
        idPrefix: null,
        username: body,
        bare: true,
        kind,
        raw,
    };
};

const usernameCandidatesForUser = (user) => {
    const parts = [
        user?.username,
        user?.displayName,
        user?.email ? String(user.email).split('@')[0] : null,
    ];
    return new Set(parts.map(sanitizeArrTagSegment).filter(Boolean));
};

const userIdCandidates = (user) => new Set(
    [user?.id, user?.plexId, user?.jellyfinId, user?.seerrUserId]
        .map((value) => sanitizeArrTagSegment(value))
        .filter(Boolean),
);

/**
 * Map an Arr requester/notify tag label onto a portal users.json entry.
 * Matches plexId, jellyfinId, portal id, legacy Seerr id, then username.
 */
export const resolvePortalUserFromArrTag = (label, portalUsers = []) => {
    const parsed = parseArrRequesterTagLabel(label);
    if (!parsed) return null;
    const users = Array.isArray(portalUsers) ? portalUsers : [];
    if (!users.length) return null;

    if (parsed.idPrefix) {
        const prefix = sanitizeArrTagSegment(parsed.idPrefix);
        const byId = users.find((user) => userIdCandidates(user).has(prefix));
        if (byId) return byId;

        // Raw (unsanitized) jellyfin GUID compare for safety
        const byJellyfin = users.find((user) => (
            sanitizeArrTagSegment(user?.jellyfinId) === prefix
            || String(user?.jellyfinId || '').toLowerCase() === String(parsed.idPrefix).toLowerCase()
        ));
        if (byJellyfin) return byJellyfin;
    }

    if (!parsed.username) return null;
    return users.find((user) => usernameCandidatesForUser(user).has(parsed.username)) || null;
};

/**
 * Resolve the first portal owner from requester tags (skips notify-only labels).
 * @returns {{ user: object, tagLabel: string }|null}
 */
export const resolvePortalOwnerFromArrTagLabels = (labels = [], portalUsers = []) => {
    const list = Array.isArray(labels) ? labels : [];
    for (const label of list) {
        const parsed = parseArrRequesterTagLabel(label);
        if (parsed?.kind === 'notify') continue;
        const user = resolvePortalUserFromArrTag(label, portalUsers);
        if (user?.id != null) {
            return { user, tagLabel: String(label || '').trim() };
        }
    }
    return null;
};

/** Notify subscribers implied by `n-…` tags on an Arr item. */
export const resolveNotifyUsersFromArrTagLabels = (labels = [], portalUsers = []) => {
    const out = [];
    const seen = new Set();
    for (const label of (Array.isArray(labels) ? labels : [])) {
        const parsed = parseArrRequesterTagLabel(label);
        if (parsed?.kind !== 'notify') continue;
        const user = resolvePortalUserFromArrTag(label, portalUsers);
        if (!user?.id) continue;
        const key = String(user.id);
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ user, tagLabel: String(label || '').trim() });
    }
    return out;
};

/** True when `label` matches any of this user's media-server requester tags. */
export const isPortalRequesterTagForUser = (label, user, _mediaServerType = 'plex') => {
    const wanted = new Set(buildPortalRequesterTagsForUser(user));
    if (!wanted.size) return false;
    return wanted.has(sanitizeArrTagSegment(label));
};

/** True when `label` matches any of this user's media-server notify tags. */
export const isNotifyTagForUser = (label, user, _mediaServerType = 'plex') => {
    const wanted = new Set(buildNotifyTagsForUser(user));
    if (!wanted.size) return false;
    return wanted.has(sanitizeArrTagSegment(label));
};

/**
 * Collect portal users implied by Arr tag labels (legacy, bare, media-server, or notify).
 * @returns {Map<string, { user: object, sourceLabels: string[] }>}
 */
export const collectPortalUsersFromArrTagLabels = (labels = [], portalUsers = []) => {
    const byId = new Map();
    for (const label of (Array.isArray(labels) ? labels : [])) {
        const user = resolvePortalUserFromArrTag(label, portalUsers);
        if (!user?.id) continue;
        const key = String(user.id);
        const existing = byId.get(key);
        if (existing) {
            existing.sourceLabels.push(String(label || '').trim());
        } else {
            byId.set(key, { user, sourceLabels: [String(label || '').trim()] });
        }
    }
    return byId;
};

export default {
    sanitizeArrTagSegment,
    mediaUserIdsForTag,
    mediaUserIdForTag,
    buildPortalRequesterTagLabel,
    parseArrRequesterTagLabel,
    resolvePortalUserFromArrTag,
    resolvePortalOwnerFromArrTagLabels,
    resolveNotifyUsersFromArrTagLabels,
    buildPortalRequesterTagsForUser,
    buildNotifyTagsForUser,
    buildPortalRequesterTagForUser,
    buildNotifyTagForUser,
    isPortalRequesterTagForUser,
    isNotifyTagForUser,
    collectPortalUsersFromArrTagLabels,
};
