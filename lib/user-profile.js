const DISPLAY_NAME_MAX = 40;

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
