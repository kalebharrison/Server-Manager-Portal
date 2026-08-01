/**
 * Seerr-compatible Arr requester tags.
 * Write: {portalUserId}-{sanitizedUsername}
 * Read: portal-id / seerr-id prefixes, bare usernames, optional seerrUserId.
 */

const norm = (value) => String(value || '').trim().toLowerCase();

/** Arr tag labels allow a-z0-9- only (newer *arr). */
export const sanitizeArrTagSegment = (value) => norm(value)
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

/**
 * Build the label written on Arr push.
 * @param {string|number} userId
 * @param {string} username
 */
export const buildPortalRequesterTagLabel = (userId, username) => {
    const id = sanitizeArrTagSegment(userId);
    const user = sanitizeArrTagSegment(username);
    if (id && user) return `${id}-${user}`;
    return user || id || '';
};

/**
 * Parse an Arr tag label into ownership candidates.
 * @returns {{ idPrefix: string|null, username: string, bare: boolean, raw: string }|null}
 */
export const parseArrRequesterTagLabel = (label) => {
    const raw = sanitizeArrTagSegment(label);
    if (!raw) return null;

    // Seerr / portal: "{numericId}-{username}" (e.g. 16-i2ach, 123-kalebharrison)
    const match = raw.match(/^(\d+)-(.+)$/);
    if (match) {
        return {
            idPrefix: match[1],
            username: sanitizeArrTagSegment(match[2]) || match[2],
            bare: false,
            raw,
        };
    }

    return {
        idPrefix: null,
        username: raw,
        bare: true,
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

/**
 * Map an Arr requester tag label onto a portal users.json entry.
 * Prefers stable id matches (portal id / plexId / seerrUserId), then username.
 */
export const resolvePortalUserFromArrTag = (label, portalUsers = []) => {
    const parsed = parseArrRequesterTagLabel(label);
    if (!parsed) return null;
    const users = Array.isArray(portalUsers) ? portalUsers : [];
    if (!users.length) return null;

    if (parsed.idPrefix) {
        const byId = users.find((user) => (
            String(user?.id ?? '') === parsed.idPrefix
            || String(user?.plexId ?? '') === parsed.idPrefix
        ));
        if (byId) return byId;

        const bySeerr = users.find((user) => (
            String(user?.seerrUserId ?? '') === parsed.idPrefix
        ));
        if (bySeerr) return bySeerr;
    }

    if (!parsed.username) return null;
    return users.find((user) => usernameCandidatesForUser(user).has(parsed.username)) || null;
};

/**
 * Resolve the first portal owner from a list of Arr tag labels.
 * @returns {{ user: object, tagLabel: string }|null}
 */
export const resolvePortalOwnerFromArrTagLabels = (labels = [], portalUsers = []) => {
    const list = Array.isArray(labels) ? labels : [];
    for (const label of list) {
        const user = resolvePortalUserFromArrTag(label, portalUsers);
        if (user?.id != null) {
            return { user, tagLabel: String(label || '').trim() };
        }
    }
    return null;
};

export default {
    sanitizeArrTagSegment,
    buildPortalRequesterTagLabel,
    parseArrRequesterTagLabel,
    resolvePortalUserFromArrTag,
    resolvePortalOwnerFromArrTagLabels,
};
