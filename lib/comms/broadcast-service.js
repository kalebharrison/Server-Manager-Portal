import nodemailer from 'nodemailer';
import { sanitizeBroadcastHtml } from './broadcast-html.js';
import { isSmtpReady } from './smtp-ready.js';

export { sanitizeBroadcastHtml };

const selectBroadcastRecipients = (users, recipientFilter, selectedUserIds) => {
    const now = new Date();
    return users.filter((user) => {
        if (!user.email) return false;
        if (recipientFilter === 'all') return true;
        if (recipientFilter === 'selected') return selectedUserIds && selectedUserIds.includes(user.id);
        if (recipientFilter === 'active') return user.plexAccessStatus === 'active';
        if (recipientFilter === 'trial') return user.isTrial;
        if (recipientFilter === 'expired') return user.expiryDate && new Date(user.expiryDate) < now;
        if (recipientFilter === 'expiring') {
            if (!user.expiryDate || new Date(user.expiryDate) <= now) return false;
            const diffTime = Math.abs(new Date(user.expiryDate) - now);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            return diffDays <= 7;
        }
        return false;
    });
};

export const createBroadcastService = ({
    configPath,
    usersPath,
    loadFile,
    sendEmail,
    discordNotifier = null,
    log,
}) => {
    const startBroadcast = async ({ subject, body, recipientFilter, selectedUserIds }) => {
        const users = await loadFile(usersPath, []);
        const targetUsers = selectBroadcastRecipients(users, recipientFilter, selectedUserIds);
        if (targetUsers.length === 0) {
            const error = new Error('No users found matching the selected criteria (with valid emails).');
            error.statusCode = 400;
            throw error;
        }

        const safeBody = sanitizeBroadcastHtml(body);
        (async () => {
            const config = await loadFile(configPath, null);
            void discordNotifier?.notifyBroadcast?.(config, { subject, body: safeBody })
                .catch((error) => log?.(`Discord broadcast mirror failed: ${error.message}`));
            if (!isSmtpReady(config)) {
                log?.('Broadcast email skipped: SMTP is disabled or not configured.');
                return;
            }
            const bulkTransporter = nodemailer.createTransport({
                pool: true,
                host: config.smtpHost,
                port: parseInt(config.smtpPort, 10) || 587,
                secure: !!config.smtpSecure,
                auth: {
                    user: config.smtpUser,
                    pass: config.smtpPass,
                },
                maxConnections: 1,
                maxMessages: 100,
            });

            for (const user of targetUsers) {
                try {
                    await sendEmail(config, user.email, subject, safeBody, bulkTransporter);
                    await new Promise((resolve) => setTimeout(resolve, 2000));
                } catch (e) {
                    log(`Broadcast failed to ${user.email}: ${e.message}`);
                }
            }
            log(`Broadcast completed for ${targetUsers.length} users.`);
            bulkTransporter.close();
        })();

        return { count: targetUsers.length };
    };

    const sendTestBroadcast = async ({ subject, body, adminEmail }) => {
        const config = await loadFile(configPath, null);
        if (!config || !isSmtpReady(config)) {
            const error = new Error('Email is disabled or SMTP is not configured.');
            error.statusCode = 400;
            throw error;
        }
        if (!adminEmail) {
            const error = new Error('Admin email not found in session.');
            error.statusCode = 400;
            throw error;
        }

        log(`Sending test broadcast email to ${adminEmail}...`);
        await sendEmail(config, adminEmail, subject, sanitizeBroadcastHtml(body));
    };

    return {
        startBroadcast,
        sendTestBroadcast,
    };
};
