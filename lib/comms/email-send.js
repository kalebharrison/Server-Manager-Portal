import nodemailer from 'nodemailer';

import { allowSmtpRecipient, isSmtpConfigured, isSmtpEnabled } from './smtp-ready.js';
import { buildInlineLogoAttachment, resolveLocalLogoPath } from './email-logo.js';

export { buildInlineLogoAttachment, resolveLocalLogoPath };

export const checkHasLogo = async (config = {}) => !!(await resolveLocalLogoPath(config));

export const shouldAttachInlineLogo = (html = '') => /cid:logo/i.test(String(html || ''));

export const createEmailSendHelpers = ({
    usersPath,
    emailLogPath,
    loadFile,
    saveFile,
    appendAuditLog,
    log,
}) => {
    let cachedTransporter = null;
    let cachedTransporterKey = '';

    const emailLogKey = (userId, type, uniqueKey) => `${String(userId)}|${String(type)}|${String(uniqueKey)}`;

    const hasEmailBeenSent = async (userId, type, uniqueKey) => {
        try {
            const logs = await loadFile(emailLogPath, []);
            const needle = emailLogKey(userId, type, uniqueKey);
            return logs.some((entry) => emailLogKey(entry.userId, entry.type, entry.uniqueKey) === needle);
        } catch (e) {
            return false;
        }
    };

    const logEmailSent = async (userId, type, uniqueKey) => {
        try {
            const logs = await loadFile(emailLogPath, []);
            logs.push({
                userId: String(userId),
                type,
                uniqueKey: String(uniqueKey),
                timestamp: new Date().toISOString()
            });
            if (logs.length > 5000) logs.splice(0, logs.length - 5000);
            await saveFile(emailLogPath, logs);
        } catch (e) {
            log(`Failed to write to email log: ${e.message}`);
        }
    };

    const getTransporter = (config, customTransporter = null) => {
        if (customTransporter) return customTransporter;
        const key = [
            config.smtpHost || '',
            config.smtpPort || '',
            config.smtpSecure ? '1' : '0',
            config.smtpUser || '',
            config.smtpPass || '',
        ].join('\u001f');
        if (cachedTransporter && cachedTransporterKey === key) return cachedTransporter;
        cachedTransporterKey = key;
        cachedTransporter = nodemailer.createTransport({
            host: config.smtpHost,
            port: parseInt(config.smtpPort, 10) || 587,
            secure: !!config.smtpSecure,
            auth: {
                user: config.smtpUser,
                pass: config.smtpPass,
            },
        });
        return cachedTransporter;
    };

    const sendEmail = async (config, to, subject, html, customTransporter = null, options = {}) => {
        if (!isSmtpEnabled(config)) {
            log('SMTP is disabled. Skipping email send.');
            return false;
        }
        if (!isSmtpConfigured(config)) {
            log('SMTP is not fully configured. Skipping email send.');
            return false;
        }
        const users = await loadFile(usersPath, []);
        if (!allowSmtpRecipient(config, users, to, options)) {
            log(`SMTP admin-only: skipped member recipient ${to}`);
            return false;
        }

        const transporter = getTransporter(config, customTransporter);
        const logo = shouldAttachInlineLogo(html) ? await buildInlineLogoAttachment(config) : null;

        const mailOptions = {
            from: config.smtpFrom || config.smtpUser,
            to,
            subject,
            html,
            attachments: logo ? [logo] : [],
        };

        try {
            const info = await transporter.sendMail(mailOptions);
            log(`Email sent successfully: ${info.messageId}`);
            const foundUser = users.find(u => u.email === to);
            const targetUsername = foundUser ? foundUser.username : 'Recipient';
            await appendAuditLog('system_email_sent', { username: 'System', email: config.smtpFrom || config.smtpUser }, { username: targetUsername, email: to }, { subject });
            return true;
        } catch (error) {
            log(`Error sending email to ${to}: ${error.message}`);
            throw error;
        }
    };

    return {
        emailLogKey,
        hasEmailBeenSent,
        logEmailSent,
        sendEmail,
    };
};
