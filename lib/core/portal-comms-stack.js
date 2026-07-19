import { createBroadcastService } from '../comms/broadcast-service.js';
import { createEmailService } from '../comms/email-service.js';
import { createMemberNotifications } from '../users/member-notifications.js';
import { createNewsletterService } from '../comms/newsletter-service.js';
import { escapeHtmlAttr } from '../http/html-shell.js';
import { getDaysUntilExpiry } from '../core/date-utils.js';
import {
    CONFIG_PATH,
    USERS_PATH,
    EMAIL_LOG_PATH,
} from '../config/data-paths.js';

export const createPortalCommsStack = ({
    loadFile,
    saveFile,
    appendAuditLog,
    getPlexConnectionUri,
    loadPlexStatsFromDisk,
    getCachedPlexStats,
    getHealthData,
    discordNotifier = null,
    log,
}) => {
    const { sendEmail, sendMemberNotice, checkAndSendNotifications, sendExpiryEmail, sendAdjustmentEmail } = createEmailService({
        usersPath: USERS_PATH,
        emailLogPath: EMAIL_LOG_PATH,
        loadFile,
        saveFile,
        appendAuditLog,
        getDaysUntilExpiry,
        escapeHtmlAttr,
        log,
    });

    const memberNotifications = createMemberNotifications({
        usersPath: USERS_PATH,
        loadFile,
        sendMemberNotice,
        escapeHtmlAttr,
        discordNotifier,
        log,
    });

    const backgroundExtras = {
        checkWatchlistAvailability: memberNotifications.checkWatchlistAvailability,
        requestAppService: null,
    };

    const { startBroadcast, sendTestBroadcast } = createBroadcastService({
        configPath: CONFIG_PATH,
        usersPath: USERS_PATH,
        loadFile,
        sendEmail,
        log,
    });

    const { checkAndSendNewsletter, sendTestNewsletter, sendManualNewsletter } = createNewsletterService({
        configPath: CONFIG_PATH,
        usersPath: USERS_PATH,
        loadFile,
        saveFile,
        getPlexConnectionUri,
        getPlexStats: async () => getCachedPlexStats() || await loadPlexStatsFromDisk(),
        getHealthData,
        escapeHtmlAttr,
        log,
    });

    return {
        sendEmail,
        sendAdjustmentEmail,
        checkAndSendNotifications,
        memberNotifications,
        backgroundExtras,
        startBroadcast,
        sendTestBroadcast,
        sendTestNewsletter,
        sendManualNewsletter,
        checkAndSendNewsletter,
        sendExpiryEmail,
        escapeHtmlAttr,
    };
};
