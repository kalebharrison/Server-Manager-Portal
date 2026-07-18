import {
    ANALYTICS_DAYS_OPTIONS,
    CONTACT_EMAIL_MAX,
    DISPLAY_NAME_MAX,
    EMAIL_RE,
    LANDING_OPTIONS,
    LOCALE_OPTIONS,
} from './user-profile-constants.js';

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
