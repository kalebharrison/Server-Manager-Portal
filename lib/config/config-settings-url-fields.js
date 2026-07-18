import { sanitizeHttpUrl, sanitizePublicDomain } from '../http/public-url.js';

export const buildPublicContactUrlFields = ({
    publicDomain,
    requestUrl,
    contactUrl,
    contactWhatsApp,
    contactEmail,
    existingConfig,
}) => {
    try {
        return {
            publicDomain: sanitizePublicDomain(publicDomain),
            requestUrl: (() => {
                const fallback = existingConfig.requestUrl || 'https://yourdomain.com';
                if (requestUrl === undefined) return fallback;
                const next = String(requestUrl || '').trim();
                if (!next) return 'https://yourdomain.com';
                return sanitizeHttpUrl(next, { allowEmpty: false, field: 'requestUrl' });
            })(),
            contactUrl: contactUrl ? sanitizeHttpUrl(contactUrl, { field: 'contactUrl' }) : '',
            contactWhatsApp: String(contactWhatsApp || '').replace(/[^\d+]/g, '').slice(0, 20),
            contactEmail: String(contactEmail || '').trim().slice(0, 320),
        };
    } catch (e) {
        throw new Error(`Invalid settings URL: ${e.message}`);
    }
};
