/**
 * Arr requester / notify tags.
 * Write: one stable tag per portal user — sanitized `{user.id}` / `n-{user.id}` (no username).
 * Username is not part of identity (renames must not create new tags).
 * Read: portal id, plexId, jellyfinId, legacy `{id}-{username}` / Seerr / bare usernames.
 */

const norm = (value) => String(value || '').trim().toLowerCase();

/** Arr tag labels allow a-z0-9- only (newer *arr). */
export const sanitizeArrTagSegment = (value) => norm(value)
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

/**
 * Stable id for Arr tag writes: portal user id only (one tag set per person).
 * mediaServerType is ignored — kept for call-site compatibility.
 */
export const mediaUserIdForTag = (user, _mediaServerType = 'plex') => (
    String(user?.id || '').trim()
);

/**
 * Build a requester label. Prefer id-only; optional username kept for legacy callers/tests.
 * @param {string|number} userId
 * @param {string} [username]
 */
export const buildPortalRequesterTagLabel = (userId, username = '') => {
    const id = sanitizeArrTagSegment(userId);
    if (!id) return sanitizeArrTagSegment(username) || '';
    // Username is display-only legacy; new writes omit it.
    if (!username) return id;
    const user = sanitizeArrTagSegment(username);
    return user ? `${id}-${user}` : id;
};

/** Canonical requester label: sanitized portal user id (rename-safe). */
export const buildPortalRequesterTagForUser = (user, mediaServerType = 'plex') => {
    const id = mediaUserIdForTag(user, mediaServerType);
    return id ? sanitizeArrTagSegment(id) : '';
};

/** Canonical notify label: `n-{portalUserId}`. */
export const buildNotifyTagForUser = (user, mediaServerType = 'plex') => {
    const requester = buildPortalRequesterTagForUser(user, mediaServerType);
    return requester ? `n-${requester}` : '';
};

/** True when label is this portal user's requester tag (id-only or legacy id-username). */
const labelMatchesPortalUserId = (label, userId, { notify = false } = {}) => {
    const id = sanitizeArrTagSegment(userId);
    const raw = sanitizeArrTagSegment(label);
    if (!id || !raw) return false;
    if (notify) {
        if (raw === `n-${id}`) return true;
        // Legacy: n-{id}-{username}
        return raw.startsWith(`n-${id}-`);
    }
    if (raw === id) return true;
    // Legacy: {id}-{username}
    return raw.startsWith(`${id}-`);
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
 * Matches portal/plex/jellyfin/Seerr ids (id-only or legacy id-username), then bare username.
 */
export const resolvePortalUserFromArrTag = (label, portalUsers = []) => {
    const parsed = parseArrRequesterTagLabel(label);
    if (!parsed) return null;
    const users = Array.isArray(portalUsers) ? portalUsers : [];
    if (!users.length) return null;

    // Id-only tags (`100`, `n-100`) and legacy (`100-oldname`, `n-100-oldname`) — username ignored.
    const byStableId = users.find((user) => {
        for (const candidate of userIdCandidates(user)) {
            if (labelMatchesPortalUserId(label, candidate, { notify: parsed.kind === 'notify' })) {
                return true;
            }
            // Requester match against raw body when notify prefix already stripped by helper.
            if (parsed.kind === 'requester' && labelMatchesPortalUserId(parsed.raw, candidate)) {
                return true;
            }
        }
        return false;
    });
    if (byStableId) return byStableId;

    if (parsed.idPrefix) {
        const prefix = sanitizeArrTagSegment(parsed.idPrefix);
        const byId = users.find((user) => userIdCandidates(user).has(prefix));
        if (byId) return byId;

        const byJellyfin = users.find((user) => (
            sanitizeArrTagSegment(user?.jellyfinId) === prefix
            || String(user?.jellyfinId || '').toLowerCase() === String(parsed.idPrefix).toLowerCase()
        ));
        if (byJellyfin) return byJellyfin;
    }

    // Bare username tags only (no id prefix) — last resort for old Seerr bare labels.
    if (parsed.bare && parsed.username) {
        return users.find((user) => usernameCandidatesForUser(user).has(parsed.username)) || null;
    }
    return null;
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

/** True when `label` is this user's requester tag (id-only or legacy id-username). */
export const isPortalRequesterTagForUser = (label, user, mediaServerType = 'plex') => {
    const id = mediaUserIdForTag(user, mediaServerType);
    if (!id) return false;
    const parsed = parseArrRequesterTagLabel(label);
    if (parsed?.kind === 'notify') return false;
    return labelMatchesPortalUserId(label, id, { notify: false });
};

/** True when `label` is this user's notify tag (id-only or legacy n-id-username). */
export const isNotifyTagForUser = (label, user, mediaServerType = 'plex') => {
    const id = mediaUserIdForTag(user, mediaServerType);
    if (!id) return false;
    return labelMatchesPortalUserId(label, id, { notify: true });
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
    mediaUserIdForTag,
    buildPortalRequesterTagLabel,
    parseArrRequesterTagLabel,
    resolvePortalUserFromArrTag,
    resolvePortalOwnerFromArrTagLabels,
    resolveNotifyUsersFromArrTagLabels,
    buildPortalRequesterTagForUser,
    buildNotifyTagForUser,
    isPortalRequesterTagForUser,
    isNotifyTagForUser,
    collectPortalUsersFromArrTagLabels,
};
