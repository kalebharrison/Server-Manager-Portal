import { isAdminPortalUser } from '../users/ensure-admin-portal-user.js';
import { getDeliveryEmail } from '../users/user-profile.js';
import { extractEmailAddress } from './email-recipients.js';

export const isSmtpEnabled = (config = {}) => config?.smtpEnabled !== false;

export const isSmtpConfigured = (config = {}) => !!(
    config?.smtpHost && config?.smtpUser && config?.smtpPass
);

export const isSmtpReady = (config = {}) => isSmtpEnabled(config) && isSmtpConfigured(config);

export const isSmtpAdminOnly = (config = {}) => !!config?.smtpAdminOnly;

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();

export const isAdminEmailRecipient = (config = {}, users = [], to = '') => {
    const target = normalizeEmail(to);
    if (!target) return false;
    const extras = [config.contactEmail, config.adminEmail, extractEmailAddress(config.smtpFrom)]
        .map(normalizeEmail)
        .filter(Boolean);
    if (extras.includes(target)) return true;
    return (Array.isArray(users) ? users : []).some((user) => {
        if (!isAdminPortalUser(user, config.adminPlexId, config.adminJellyfinId)) return false;
        return [getDeliveryEmail(user), user.email, user.contactEmail]
            .map(normalizeEmail)
            .includes(target);
    });
};

export const allowSmtpRecipient = (config = {}, users = [], to = '', { allowAnyRecipient = false } = {}) => {
    if (allowAnyRecipient || !isSmtpAdminOnly(config)) return true;
    return isAdminEmailRecipient(config, users, to);
};
