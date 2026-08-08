import { isAdminPortalUser } from '../users/ensure-admin-portal-user.js';
import { getDeliveryEmail, sanitizeContactEmail } from '../users/user-profile.js';

export const extractEmailAddress = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const angled = raw.match(/<([^>]+)>/);
    return sanitizeContactEmail(angled ? angled[1] : raw) || '';
};

/** Owner inbox for admin-facing mail and member reply/contact CTAs. Never SMTP username. */
export const resolveOwnerInbox = (config = {}, users = []) => {
    const contact = sanitizeContactEmail(config.contactEmail);
    if (contact) return contact;
    const listed = sanitizeContactEmail(config.adminEmail);
    if (listed) return listed;
    for (const user of Array.isArray(users) ? users : []) {
        if (!isAdminPortalUser(user, config.adminPlexId, config.adminJellyfinId)) continue;
        const email = getDeliveryEmail(user);
        if (email) return email;
    }
    return extractEmailAddress(config.smtpFrom);
};

export const resolveOwnerContactHref = (config = {}, users = []) => {
    const url = String(config.contactUrl || '').trim();
    if (url) return url;
    const inbox = resolveOwnerInbox(config, users);
    return inbox ? `mailto:${inbox}` : '';
};

export const listDeliverableMembers = (users = [], predicate = () => true) => (
    (Array.isArray(users) ? users : [])
        .map((user) => ({ user, email: getDeliveryEmail(user) }))
        .filter(({ user, email }) => email && predicate(user))
);
