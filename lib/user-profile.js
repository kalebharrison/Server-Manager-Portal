const DISPLAY_NAME_MAX = 40;
const CONTACT_EMAIL_MAX = 120;

const LANDING_OPTIONS = new Set(['portal', 'discover', 'request', 'status', 'analytics', 'issues']);
const ANALYTICS_DAYS_OPTIONS = new Set(['7', '30', '90', 'all']);
const LOCALE_OPTIONS = new Set([
    '',
    'en-US',
    'en-GB',
    'en-AU',
    'de-DE',
    'fr-FR',
    'es-ES',
    'pt-BR',
    'nl-NL',
    'sv-SE',
    'nb-NO',
    'da-DK',
    'fi-FI',
    'it-IT',
    'pl-PL',
    'ja-JP',
]);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const sanitizeDisplayName = (value) => {
    const cleaned = String(value ?? '')
        .replace(/[\u0000-\u001f\u007f]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, DISPLAY_NAME_MAX);
    return cleaned;
};

export const resolveDisplayName = (user = {}) => {
    const custom = sanitizeDisplayName(user.displayName);
    if (custom) return custom;
    return String(user.username || user.email || 'User').trim() || 'User';
};

/** Newsletter is opt-in only. Legacy optOutNewsletter is ignored for sending. */
export const wantsNewsletter = (user = {}) => user?.newsletterOptIn === true;

export const sanitizeContactEmail = (value) => {
    const cleaned = String(value ?? '').trim().toLowerCase().slice(0, CONTACT_EMAIL_MAX);
    if (!cleaned) return '';
    if (!EMAIL_RE.test(cleaned)) return null;
    return cleaned;
};

/** Prefer member contact override; fall back to linked account email. */
export const getDeliveryEmail = (user = {}) => {
    const override = sanitizeContactEmail(user.contactEmail);
    if (override) return override;
    const linked = sanitizeContactEmail(user.email);
    return linked || '';
};

export const wantsNotifyAccessExpiry = (user = {}) => user?.notifyAccessExpiry === true;
export const wantsNotifyRequestUpdates = (user = {}) => user?.notifyRequestUpdates === true;
export const wantsNotifyIssueReplies = (user = {}) => user?.notifyIssueReplies === true;
export const wantsNotifyWatchlistAvailable = (user = {}) => user?.notifyWatchlistAvailable === true;
export const hidesFromLeaderboards = (user = {}) => user?.hideFromLeaderboards === true;

export const sanitizeLocale = (value) => {
    if (value === undefined || value === null) return undefined;
    const locale = String(value).trim();
    if (!LOCALE_OPTIONS.has(locale)) return null;
    return locale;
};

export const resolveLocale = (user = {}, fallback = undefined) => {
    const locale = String(user?.locale || '').trim();
    if (LOCALE_OPTIONS.has(locale) && locale) return locale;
    return fallback;
};

export const sanitizeHomeLanding = (value) => {
    if (value === undefined || value === null) return undefined;
    const landing = String(value).trim();
    if (!LANDING_OPTIONS.has(landing)) return null;
    return landing;
};

export const resolveHomeLanding = (user = {}) => {
    const landing = sanitizeHomeLanding(user?.homeLanding);
    return landing || 'portal';
};

export const sanitizeHomeAnalyticsDays = (value) => {
    if (value === undefined || value === null) return undefined;
    const days = String(value).trim();
    if (!ANALYTICS_DAYS_OPTIONS.has(days)) return null;
    return days === 'all' ? 'all' : Number(days);
};

export const resolveHomeAnalyticsDays = (user = {}) => {
    const days = sanitizeHomeAnalyticsDays(user?.homeAnalyticsDays);
    return days === undefined || days === null ? 30 : days;
};

export const resolveHomeShowWrapUp = (user = {}) => user?.homeShowWrapUp !== false;
export const resolveHomeShowWeekCalendar = (user = {}) => user?.homeShowWeekCalendar !== false;

const setBoolOptIn = (user, key, value) => {
    const next = !!value;
    if (user[key] === next) return false;
    user[key] = next;
    return true;
};

/**
 * Apply account preference patch onto a user record.
 * Returns { changed, errors }.
 */
export const applyAccountPreferencePatch = (user, patch = {}) => {
    const errors = [];
    let changed = false;

    if (patch.newsletterOptIn !== undefined) {
        if (setBoolOptIn(user, 'newsletterOptIn', patch.newsletterOptIn)) {
            delete user.optOutNewsletter;
            changed = true;
        }
    }

    if (patch.displayName !== undefined) {
        const nextName = sanitizeDisplayName(patch.displayName);
        const previous = sanitizeDisplayName(user.displayName);
        if (nextName !== previous) {
            if (nextName) user.displayName = nextName;
            else delete user.displayName;
            changed = true;
        }
    }

    if (patch.contactEmail !== undefined) {
        const nextEmail = sanitizeContactEmail(patch.contactEmail);
        if (nextEmail === null) {
            errors.push('Enter a valid contact email, or leave it blank.');
        } else {
            const previous = sanitizeContactEmail(user.contactEmail) || '';
            if (nextEmail !== previous) {
                if (nextEmail) user.contactEmail = nextEmail;
                else delete user.contactEmail;
                changed = true;
            }
        }
    }

    for (const key of [
        'notifyAccessExpiry',
        'notifyRequestUpdates',
        'notifyIssueReplies',
        'notifyWatchlistAvailable',
        'hideFromLeaderboards',
    ]) {
        if (patch[key] !== undefined && setBoolOptIn(user, key, patch[key])) changed = true;
    }

    if (patch.locale !== undefined) {
        const nextLocale = sanitizeLocale(patch.locale);
        if (nextLocale === null) {
            errors.push('Unsupported locale.');
        } else if ((user.locale || '') !== (nextLocale || '')) {
            if (nextLocale) user.locale = nextLocale;
            else delete user.locale;
            changed = true;
        }
    }

    if (patch.homeLanding !== undefined) {
        const nextLanding = sanitizeHomeLanding(patch.homeLanding);
        if (nextLanding === null) {
            errors.push('Unsupported home landing page.');
        } else if ((user.homeLanding || 'portal') !== nextLanding) {
            user.homeLanding = nextLanding;
            changed = true;
        }
    }

    if (patch.homeAnalyticsDays !== undefined) {
        const nextDays = sanitizeHomeAnalyticsDays(patch.homeAnalyticsDays);
        if (nextDays === null) {
            errors.push('Unsupported analytics range.');
        } else if (String(user.homeAnalyticsDays ?? 30) !== String(nextDays)) {
            user.homeAnalyticsDays = nextDays;
            changed = true;
        }
    }

    if (patch.homeShowWrapUp !== undefined) {
        const next = patch.homeShowWrapUp !== false;
        if (user.homeShowWrapUp !== next) {
            user.homeShowWrapUp = next;
            changed = true;
        }
    }

    if (patch.homeShowWeekCalendar !== undefined) {
        const next = patch.homeShowWeekCalendar !== false;
        if (user.homeShowWeekCalendar !== next) {
            user.homeShowWeekCalendar = next;
            changed = true;
        }
    }

    return { changed, errors };
};

export const hiddenLeaderboardAccountIds = (users = []) => {
    const ids = new Set();
    for (const user of users) {
        if (!hidesFromLeaderboards(user)) continue;
        for (const candidate of [user.id, user.plexId, user.jellyfinId]) {
            if (candidate !== undefined && candidate !== null && candidate !== '') {
                ids.add(String(candidate));
            }
        }
    }
    return ids;
};
