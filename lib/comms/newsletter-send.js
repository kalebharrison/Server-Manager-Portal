import nodemailer from 'nodemailer';
import { getDeliveryEmail, resolveDisplayName, wantsNewsletter } from '../users/user-profile.js';

const createNewsletterTransporter = (config) => nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpSecure,
    auth: { user: config.smtpUser, pass: config.smtpPass }
});

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
        if (!config.smtpHost || !config.smtpUser) return;

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
            const recipients = users.filter(user => getDeliveryEmail(user) && wantsNewsletter(user));

            if (recipients.length === 0) return;

            void discordNotifier?.notifyNewsletter?.(config, {
                subject: 'Plex Server Automated Newsletter',
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
                    await transporter.sendMail({
                        from: config.smtpFrom || config.smtpUser,
                        to: getDeliveryEmail(user),
                        subject: 'Plex Server Automated Newsletter',
                        html: personalizedHtml,
                        attachments: attachments
                    });
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

    const sendTestNewsletter = async (config) => {
        if (!config.smtpHost || !config.smtpUser) {
            const error = new Error('SMTP not configured');
            error.statusCode = 400;
            throw error;
        }

        let adminEmail = null;
        try {
            const userRes = await fetch('https://plex.tv/api/v2/user', {
                headers: { 'X-Plex-Token': config.plexToken, 'Accept': 'application/json' }
            });
            if (userRes.ok) {
                const userData = await userRes.json();
                adminEmail = userData.email;
            }
        } catch (e) {
            log('Error fetching admin email: ' + e.message);
        }

        if (!adminEmail) {
            const error = new Error('Could not fetch admin email from Plex account.');
            error.statusCode = 400;
            throw error;
        }

        const { html, attachments } = await generateNewsletterHtml(config);
        const transporter = createNewsletterTransporter(config);

        await transporter.sendMail({
            from: config.smtpFrom || config.smtpUser,
            to: adminEmail,
            subject: 'Plex Server Automated Newsletter (Test)',
            html: html.replace(/{{USERNAME}}/g, escapeHtmlAttr('Admin')),
            attachments
        });
    };

    const sendManualNewsletter = async (config) => {
        if (!config.smtpHost || !config.smtpUser) {
            const error = new Error('SMTP not configured');
            error.statusCode = 400;
            throw error;
        }

        const users = await loadFile(usersPath, []);
        const validUsers = users.filter(u => getDeliveryEmail(u) && wantsNewsletter(u));
        if (validUsers.length === 0) {
            const error = new Error('No users with email addresses found.');
            error.statusCode = 400;
            throw error;
        }

        const { html, attachments } = await generateNewsletterHtml(config);
        const transporter = createNewsletterTransporter(config);

        void discordNotifier?.notifyNewsletter?.(config, {
            subject: 'Plex Server Automated Newsletter',
            recipientCount: validUsers.length,
        }).catch((error) => log?.(`Discord newsletter mirror failed: ${error.message}`));

        log(`Manual newsletter trigger initiated for ${validUsers.length} users.`);
        for (const user of validUsers) {
            try {
                await transporter.sendMail({
                    from: config.smtpFrom || config.smtpUser,
                    to: getDeliveryEmail(user),
                    subject: 'Plex Server Automated Newsletter',
                    html: html.replace(/{{USERNAME}}/g, escapeHtmlAttr(resolveDisplayName(user))),
                    attachments
                });
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
