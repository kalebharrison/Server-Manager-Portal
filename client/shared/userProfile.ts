const DISPLAY_NAME_MAX = 40;

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
