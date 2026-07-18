const DISPLAY_NAME_MAX = 40;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const LANDING_OPTIONS = [
    { label: 'Home', value: 'portal' },
    { label: 'Discover', value: 'discover' },
    { label: 'Requests', value: 'request' },
    { label: 'Status', value: 'status' },
    { label: 'Analytics', value: 'analytics' },
    { label: 'Issues', value: 'issues' },
] as const;

export const ANALYTICS_DAYS_OPTIONS = [
    { label: '7 days', value: '7' },
    { label: '30 days', value: '30' },
    { label: '90 days', value: '90' },
    { label: 'All time', value: 'all' },
] as const;

export const LOCALE_OPTIONS = [
    { label: 'Browser default', value: '' },
    { label: 'English (US)', value: 'en-US' },
    { label: 'English (UK)', value: 'en-GB' },
    { label: 'English (AU)', value: 'en-AU' },
    { label: 'Deutsch', value: 'de-DE' },
    { label: 'Français', value: 'fr-FR' },
    { label: 'Español', value: 'es-ES' },
    { label: 'Português (Brasil)', value: 'pt-BR' },
    { label: 'Nederlands', value: 'nl-NL' },
    { label: 'Svenska', value: 'sv-SE' },
    { label: 'Norsk', value: 'nb-NO' },
    { label: 'Dansk', value: 'da-DK' },
    { label: 'Suomi', value: 'fi-FI' },
    { label: 'Italiano', value: 'it-IT' },
    { label: 'Polski', value: 'pl-PL' },
    { label: '日本語', value: 'ja-JP' },
] as const;

export type HomeLanding = typeof LANDING_OPTIONS[number]['value'];
export type HomeAnalyticsDays = 7 | 30 | 90 | 'all';

export const sanitizeDisplayName = (value: unknown): string =>
    String(value ?? '')
        .replace(/[\u0000-\u001f\u007f]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, DISPLAY_NAME_MAX);

export const resolveDisplayName = (user?: {
    displayName?: string | null;
    username?: string | null;
    email?: string | null;
} | null): string => {
    const custom = sanitizeDisplayName(user?.displayName);
    if (custom) return custom;
    return String(user?.username || user?.email || 'User').trim() || 'User';
};

export const wantsNewsletter = (user?: { newsletterOptIn?: boolean | null } | null): boolean =>
    user?.newsletterOptIn === true;

export const sanitizeContactEmail = (value: unknown): string | null => {
    const cleaned = String(value ?? '').trim().toLowerCase().slice(0, 120);
    if (!cleaned) return '';
    if (!EMAIL_RE.test(cleaned)) return null;
    return cleaned;
};

export const resolveHomeLanding = (user?: { homeLanding?: string | null } | null): HomeLanding => {
    const landing = String(user?.homeLanding || 'portal');
    return (LANDING_OPTIONS.some((option) => option.value === landing) ? landing : 'portal') as HomeLanding;
};

export const resolveHomeAnalyticsDays = (user?: { homeAnalyticsDays?: number | string | null } | null): HomeAnalyticsDays => {
    const raw = user?.homeAnalyticsDays;
    if (raw === 'all' || raw === 7 || raw === 30 || raw === 90) return raw;
    if (raw === '7' || raw === '30' || raw === '90') return Number(raw) as 7 | 30 | 90;
    return 30;
};

export const resolveHomeShowWrapUp = (user?: { homeShowWrapUp?: boolean | null } | null): boolean =>
    user?.homeShowWrapUp !== false;

export const resolveHomeShowWeekCalendar = (user?: { homeShowWeekCalendar?: boolean | null } | null): boolean =>
    user?.homeShowWeekCalendar !== false;

export const resolveLocale = (user?: { locale?: string | null } | null): string =>
    String(user?.locale || '');
