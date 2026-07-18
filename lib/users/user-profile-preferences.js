import { setBoolOptIn } from './user-profile-constants.js';
import {
    hidesFromLeaderboards,
    sanitizeContactEmail,
    sanitizeDisplayName,
    sanitizeHomeAnalyticsDays,
    sanitizeHomeLanding,
    sanitizeLocale,
} from './user-profile-fields.js';

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
