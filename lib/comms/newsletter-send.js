import nodemailer from 'nodemailer';
import { getDeliveryEmail, resolveDisplayName, wantsNewsletter } from '../users/user-profile.js';
import { emailSubject } from './email-identity.js';
import { extractEmailAddress, resolveOwnerInbox } from './email-recipients.js';
import { allowSmtpRecipient, isSmtpReady } from './smtp-ready.js';

const createNewsletterTransporter = (config) => nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpSecure,
    auth: { user: config.smtpUser, pass: config.smtpPass }
});

const newsletterMailOptions = (config, { to, subject, html, attachments }) => {
    const replyTo = extractEmailAddress(config.contactEmail);
    return {
        from: config.smtpFrom || config.smtpUser,
        to,
        subject,
        html,
        attachments,
        ...(replyTo && replyTo !== extractEmailAddress(to) ? { replyTo } : {}),
    };
};

export const createNewsletterSendHelpers = ({
    configPath,
    usersPath,
    loadFile,
    saveFile,
    generateNewsletterHtml,
    escapeHtmlAttr,
    discordNotifier = null,
    log,
}) => {
    const checkAndSendNewsletter = async (config, force = false) => {
        if (!config.newsletterFrequency || config.newsletterFrequency === 'disabled') return;
        if (!isSmtpReady(config)) return;

        const now = new Date();
        const dateStr = now.toISOString().split('T')[0];

        if (!force) {
            const dayOfWeek = now.getDay();
            const dayOfMonth = now.getDate();

            let shouldSend = false;
            if (config.newsletterFrequency === 'weekly' && dayOfWeek === Number(config.newsletterDay)) {
                shouldSend = true;
            } else if (config.newsletterFrequency === 'monthly' && dayOfMonth === Number(config.newsletterDay)) {
                shouldSend = true;
            }

            if (!shouldSend) return;
            if (config.lastNewsletterSent === dateStr) return;
        }

        try {
            log('Generating and sending automated newsletters...');
            const { html, attachments } = await generateNewsletterHtml(config);
            const transporter = createNewsletterTransporter(config);

            const users = await loadFile(usersPath, []);
            const recipients = users.filter((user) => {
                const email = getDeliveryEmail(user);
                return email && wantsNewsletter(user) && allowSmtpRecipient(config, users, email);
            });

            if (recipients.length === 0) return;

            void discordNotifier?.notifyNewsletter?.(config, {
                subject: emailSubject(config, 'Newsletter'),
                recipientCount: recipients.length,
            }).catch((error) => log?.(`Discord newsletter mirror failed: ${error.message}`));

            config.lastNewsletterSent = dateStr;
            await saveFile(configPath, config);

            const totalDurationMs = 30 * 60 * 1000;
            const delayPerEmailMs = Math.floor(totalDurationMs / recipients.length);

            let sentCount = 0;
            for (const user of recipients) {
                const personalizedHtml = html.replace(/{{USERNAME}}/g, escapeHtmlAttr(resolveDisplayName(user)));

                try {
                    await transporter.sendMail(newsletterMailOptions(config, {
                        to: getDeliveryEmail(user),
                        subject: emailSubject(config, 'Newsletter'),
                        html: personalizedHtml,
                        attachments,
                    }));
                    sentCount++;
                    await new Promise(resolve => setTimeout(resolve, delayPerEmailMs));
                } catch (e) {
                    log(`Failed to send newsletter to ${user.email}: ${e.message}`);
                }
            }

            log(`Newsletter sent to ${sentCount} users.`);
        } catch (e) {
            log(`Failed to generate/send newsletter: ${e.message}`);
        }
    };

    const sendTestNewsletter = async (config, { to } = {}) => {
        if (!isSmtpReady(config)) {
            const error = new Error('Email is disabled or SMTP is not configured');
            error.statusCode = 400;
            throw error;
        }

        const users = await loadFile(usersPath, []);
        const adminEmail = extractEmailAddress(to) || resolveOwnerInbox(config, users);
        if (!adminEmail) {
            const error = new Error('No owner inbox configured. Set Contact Email or use an admin account with an email.');
            error.statusCode = 400;
            throw error;
        }

        const { html, attachments } = await generateNewsletterHtml(config);
        const transporter = createNewsletterTransporter(config);

        await transporter.sendMail(newsletterMailOptions(config, {
            to: adminEmail,
            subject: emailSubject(config, 'Newsletter Test'),
            html: html.replace(/{{USERNAME}}/g, escapeHtmlAttr('Admin')),
            attachments,
        }));
    };

    const sendManualNewsletter = async (config) => {
        if (!isSmtpReady(config)) {
            const error = new Error('Email is disabled or SMTP is not configured');
            error.statusCode = 400;
            throw error;
        }

        const users = await loadFile(usersPath, []);
        const validUsers = users.filter((user) => {
            const email = getDeliveryEmail(user);
            return email && wantsNewsletter(user) && allowSmtpRecipient(config, users, email);
        });
        if (validUsers.length === 0) {
            const error = new Error('No users with email addresses found.');
            error.statusCode = 400;
            throw error;
        }

        const { html, attachments } = await generateNewsletterHtml(config);
        const transporter = createNewsletterTransporter(config);

        void discordNotifier?.notifyNewsletter?.(config, {
            subject: emailSubject(config, 'Newsletter'),
            recipientCount: validUsers.length,
        }).catch((error) => log?.(`Discord newsletter mirror failed: ${error.message}`));

        log(`Manual newsletter trigger initiated for ${validUsers.length} users.`);
        for (const user of validUsers) {
            try {
                await transporter.sendMail(newsletterMailOptions(config, {
                    to: getDeliveryEmail(user),
                    subject: emailSubject(config, 'Newsletter'),
                    html: html.replace(/{{USERNAME}}/g, escapeHtmlAttr(resolveDisplayName(user))),
                    attachments,
                }));
                await new Promise(resolve => setTimeout(resolve, 15000));
            } catch (e) {
                log(`Failed to send manual newsletter to ${user.email}: ${e.message}`);
            }
        }
        log(`Manual newsletter dispatch completed.`);
        config.lastNewsletterSent = new Date().toISOString().split('T')[0];
        await saveFile(configPath, config);

        return { count: validUsers.length };
    };

    return {
        checkAndSendNewsletter,
        sendTestNewsletter,
        sendManualNewsletter,
    };
};
