export const DISPLAY_NAME_MAX = 40;
export const CONTACT_EMAIL_MAX = 120;

export const LANDING_OPTIONS = new Set(['portal', 'discover', 'request', 'status', 'analytics', 'issues']);
export const ANALYTICS_DAYS_OPTIONS = new Set(['7', '30', '90', 'all']);
export const LOCALE_OPTIONS = new Set([
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

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const setBoolOptIn = (user, key, value) => {
    const next = !!value;
    if (user[key] === next) return false;
    user[key] = next;
    return true;
};
