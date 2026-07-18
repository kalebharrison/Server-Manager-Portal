import { addMonths, addYears, getDaysUntilExpiry } from '../core/date-utils.js';
import { reconcileTrialAccessFlag } from '../auth/trial-access.js';

export { reconcileTrialAccessFlag };

export const applyBulkAction = (user, action, customDate) => {
    const baseDate = user.expiryDate ? new Date(user.expiryDate) : new Date();

    switch (action) {
        case 'addMonth':
            user.expiryDate = addMonths(baseDate, 1).toISOString();
            break;
        case 'addYear':
            user.expiryDate = addYears(baseDate, 1).toISOString();
            break;
        case 'unlimited':
            user.expiryDate = null;
            break;
        case 'custom':
            user.expiryDate = customDate ? new Date(customDate).toISOString() : null;
            break;
    }
    reconcileTrialAccessFlag(user);
};

export const maybeReinviteRevokedUser = async ({
    user,
    config,
    inviteUserToPlex,
    appendAuditLog,
    actor,
}) => {
    if (user.plexAccessStatus !== 'revoked') return false;

    const days = getDaysUntilExpiry(user.expiryDate);
    if (days === null || days >= 0) {
        const invited = await inviteUserToPlex(user, config, config.defaultLibraryIds);
        if (invited) {
            user.plexAccessStatus = 'pending';
            await appendAuditLog('relink_invite_sent', actor, user);
            return true;
        }
    }
    return false;
};
