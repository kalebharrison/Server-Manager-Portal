import { getDaysUntilExpiry } from '../core/date-utils.js';

export const reconcileTrialAccessFlag = (user) => {
    if (!user?.isTrial) return false;
    const days = getDaysUntilExpiry(user.expiryDate);
    if (days === null || days > 3) {
        user.isTrial = false;
        return true;
    }
    return false;
};
