/**
 * Strict URL helpers for admin-controlled branding / public links.
 * Blocks javascript:, data:, and other non-http(s) schemes.
 */

export const sanitizeHttpUrl = (rawUrl, { allowEmpty = true, field = 'URL' } = {}) => {
    const value = String(rawUrl ?? '').trim();
    if (!value) {
        if (allowEmpty) return '';
        throw new Error(`${field} is required`);
    }
    let parsed;
    try {
        parsed = new URL(value);
    } catch {
        throw new Error(`Invalid ${field}`);
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error(`${field} must use http or https`);
    }
    parsed.hash = '';
    return parsed.toString();
};

/** Allow absolute http(s) or a same-origin relative path beginning with a single "/". */
export const sanitizeAssetUrl = (rawUrl, { field = 'asset URL' } = {}) => {
    const value = String(rawUrl ?? '').trim();
    if (!value) return '';
    if (value.startsWith('/') && !value.startsWith('//') && !value.includes('\\')) {
        if (value.includes('://') || /[\u0000-\u001f]/.test(value)) {
            throw new Error(`Invalid ${field}`);
        }
        return value.slice(0, 2000);
    }
    return sanitizeHttpUrl(value, { allowEmpty: false, field }).slice(0, 2000);
};

export const sanitizePublicDomain = (rawUrl) => {
    const value = String(rawUrl ?? '').trim();
    if (!value) return 'https://portal.yourdomain.com';
    return sanitizeHttpUrl(value, { allowEmpty: false, field: 'publicDomain' }).replace(/\/+$/, '');
};
