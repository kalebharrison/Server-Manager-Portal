import {
    getDeliveryEmail,
    wantsNotifyAccessExpiry,
} from '../users/user-profile.js';
import { emailSubject } from './email-identity.js';
import { createEmailSendHelpers } from './email-send.js';
import { isSmtpReady } from './smtp-ready.js';
import {
    buildAccessAdjustmentHtml,
    buildAccessExpiredHtml,
    buildExpiryWarningHtml,
} from './email-templates.js';

export const createEmailService = ({
    usersPath,
    emailLogPath,
    loadFile,
    saveFile,
    appendAuditLog,
    getDaysUntilExpiry,
    escapeHtmlAttr,
    log,
}) => {
    const {
        emailLogKey,
        hasEmailBeenSent,
        logEmailSent,
        sendEmail,
    } = createEmailSendHelpers({
        usersPath,
        emailLogPath,
        loadFile,
        saveFile,
        appendAuditLog,
        log,
    });

    const checkAndSendNotifications = async (config) => {
        if (!isSmtpReady(config)) {
            return;
        }

        log('Checking for users to notify about upcoming expiry...');
        const [users, emailLogs] = await Promise.all([
            loadFile(usersPath, []),
            loadFile(emailLogPath, []),
        ]);
        const daysBefore = parseInt(config.emailDaysBefore, 10) || 7;
        const sentKeys = new Set(
            (Array.isArray(emailLogs) ? emailLogs : [])
                .filter((entry) => entry?.type === 'expiry_warning')
                .map((entry) => emailLogKey(entry.userId, entry.type, entry.uniqueKey)),
        );

        for (const user of users) {
            const deliveryEmail = getDeliveryEmail(user);
            if (!user.expiryDate || user.plexAccessStatus === 'revoked' || !deliveryEmail) {
                continue;
            }
            if (!wantsNotifyAccessExpiry(user)) continue;

            const days = getDaysUntilExpiry(user.expiryDate);
            if (days === null || days > daysBefore || days < 0) continue;

            const alreadySent = sentKeys.has(emailLogKey(user.id, 'expiry_warning', user.expiryDate));
            if (alreadySent) continue;

            log(`Sending expiry warning to ${user.username} (${deliveryEmail}) - ${days} days remaining.`);
            const subject = emailSubject(config, `Your shared access expires in ${days} day${days === 1 ? '' : 's'}`);
            const html = buildExpiryWarningHtml({ user, config, days, escapeHtmlAttr });

            try {
                const sent = await sendEmail(config, deliveryEmail, subject, html);
                if (sent) {
                    await logEmailSent(user.id, 'expiry_warning', user.expiryDate);
                }
            } catch (err) {
                log(`Failed to send email to ${user.username}: ${err.message}`);
            }
        }
    };

    const sendExpiryEmail = async (config, user) => {
        const deliveryEmail = getDeliveryEmail(user);
        if (!deliveryEmail) {
            log(`No email address for ${user.username}. Skipping expiry notification.`);
            return false;
        }
        if (!wantsNotifyAccessExpiry(user)) {
            log(`Skipping expiry email for ${user.username}: access expiry notices are opt-in.`);
            return false;
        }

        const alreadySent = await hasEmailBeenSent(user.id, 'access_expired', user.expiryDate || 'none');
        if (alreadySent) return true;

        const subject = emailSubject(config, 'Your shared access has expired');
        const html = buildAccessExpiredHtml({ user, config, escapeHtmlAttr });

        try {
            const sent = await sendEmail(config, deliveryEmail, subject, html);
            if (sent) {
                log(`Expiry notification email sent to ${user.username} (${deliveryEmail}).`);
                await logEmailSent(user.id, 'access_expired', user.expiryDate || 'none');
            }
            return sent;
        } catch (err) {
            log(`Failed to send expiry notification to ${user.username}: ${err.message}`);
            return false;
        }
    };

    const sendAdjustmentEmail = async (config, user) => {
        const deliveryEmail = getDeliveryEmail(user);
        if (!deliveryEmail) return false;

        const subject = emailSubject(config, 'Your access has been updated');
        const html = buildAccessAdjustmentHtml({ user, config, escapeHtmlAttr, getDaysUntilExpiry });

        try {
            const sent = await sendEmail(config, deliveryEmail, subject, html);
            if (sent) {
                log(`Expiry notification email sent to ${user.username} (${deliveryEmail}).`);
            }
            return sent;
        } catch (err) {
            log(`Failed to send expiry notification to ${user.username}: ${err.message}`);
            return false;
        }
    };

    const sendMemberNotice = async (config, user, { type, uniqueKey, subject, html }) => {
        const deliveryEmail = getDeliveryEmail(user);
        if (!deliveryEmail) return false;
        if (uniqueKey) {
            const alreadySent = await hasEmailBeenSent(user.id, type, uniqueKey);
            if (alreadySent) return true;
        }
        try {
            const sent = await sendEmail(config, deliveryEmail, subject, html);
            if (sent && uniqueKey) await logEmailSent(user.id, type, uniqueKey);
            return sent;
        } catch (err) {
            log(`Failed to send ${type} notice to ${user.username}: ${err.message}`);
            return false;
        }
    };

    return {
        hasEmailBeenSent,
        logEmailSent,
        sendEmail,
        sendMemberNotice,
        checkAndSendNotifications,
        sendExpiryEmail,
        sendAdjustmentEmail,
    };
};
