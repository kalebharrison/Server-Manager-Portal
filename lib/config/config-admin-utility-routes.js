import express from 'express';
import fs from 'fs/promises';
import path from 'path';

import { clientErrorMessage } from '../http/safe-client-error.js';
import { emailSubject } from '../comms/email-identity.js';
import { sendMockEmailCatalog } from '../comms/email-mock-catalog.js';
import { buildSmtpTestHtml } from '../comms/email-templates.js';

export const registerConfigAdminUtilityRoutes = ({
    app,
    requireAdmin,
    adminSensitiveRateLimit = (req, res, next) => next(),
    configPath,
    secretMask,
    loadFile,
    saveFile,
    sendEmail,
    log,
}) => {
    const CONFIG_PATH = configPath;
    const SECRET_MASK = secretMask;

    app.post('/api/config/logo', requireAdmin, express.raw({ type: 'image/*', limit: '5mb' }), async (req, res) => {
        try {
            const buf = req.body;
            if (!Buffer.isBuffer(buf) || buf.length < 4) {
                return res.status(400).json({ error: 'Invalid image file.' });
            }
            // Verify PNG (89 50 4E 47) or JPEG (FF D8 FF) magic bytes; Content-Type alone is spoofable.
            const isPng = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47;
            const isJpeg = buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF;
            if (!isPng && !isJpeg) {
                return res.status(400).json({ error: 'Invalid image format. Only PNG and JPEG files are accepted.' });
            }
            const logoDir = path.join(process.cwd(), 'static');
            await fs.mkdir(logoDir, { recursive: true });
            const logoPath = path.join(logoDir, 'logo.png');
            await fs.writeFile(logoPath, buf);
            res.json({ message: 'Logo uploaded successfully.' });
        } catch (e) {
            log('Failed to upload logo: ' + e.message);
            res.status(500).json({ error: 'Failed to upload logo.' });
        }
    });

    app.post('/api/config/test-email', requireAdmin, adminSensitiveRateLimit, async (req, res) => {
        const { smtpHost, smtpPort, smtpUser, smtpPass, smtpFrom, smtpSecure, testRecipient } = req.body;

        if (!smtpHost || !smtpUser || !smtpPass || !testRecipient) {
            return res.status(400).json({ error: 'Host, user, password, and test recipient are required.' });
        }

        const storedConfig = await loadFile(CONFIG_PATH, {});
        const effectiveSmtpPass = smtpPass === SECRET_MASK ? (storedConfig.smtpPass || '') : smtpPass;
        const effectiveSmtpUser = smtpUser === SECRET_MASK ? (storedConfig.smtpUser || '') : smtpUser;
        if (!effectiveSmtpUser || !effectiveSmtpPass) {
            return res.status(400).json({ error: 'Host, user, password, and test recipient are required.' });
        }

        const config = {
            smtpEnabled: storedConfig.smtpEnabled !== false,
            smtpAdminOnly: !!storedConfig.smtpAdminOnly,
            smtpHost,
            smtpPort: parseInt(smtpPort, 10) || 587,
            smtpUser: effectiveSmtpUser,
            smtpPass: effectiveSmtpPass,
            smtpFrom,
            smtpSecure: !!smtpSecure,
            adminPlexId: storedConfig.adminPlexId,
            adminJellyfinId: storedConfig.adminJellyfinId,
            contactEmail: storedConfig.contactEmail,
        };

        try {
            log(`Sending test email to ${testRecipient}...`);
            await sendEmail(
                config,
                testRecipient,
                emailSubject(config, 'Test email'),
                buildSmtpTestHtml(config),
                null,
                { allowAnyRecipient: true },
            );
            res.json({ message: 'Test email sent successfully!' });
        } catch (error) {
            log(`Failed to send test email: ${error.message}`);
            res.status(500).json({ error: clientErrorMessage(error, 'SMTP test failed.') });
        }
    });

    app.post('/api/config/test-all-emails', requireAdmin, adminSensitiveRateLimit, async (req, res) => {
        const { smtpHost, smtpPort, smtpUser, smtpPass, smtpFrom, smtpSecure, testRecipient } = req.body;

        if (!smtpHost || !smtpUser || !smtpPass || !testRecipient) {
            return res.status(400).json({ error: 'Host, user, password, and test recipient are required.' });
        }

        const storedConfig = await loadFile(CONFIG_PATH, {});
        const effectiveSmtpPass = smtpPass === SECRET_MASK ? (storedConfig.smtpPass || '') : smtpPass;
        const effectiveSmtpUser = smtpUser === SECRET_MASK ? (storedConfig.smtpUser || '') : smtpUser;
        if (!effectiveSmtpUser || !effectiveSmtpPass) {
            return res.status(400).json({ error: 'Host, user, password, and test recipient are required.' });
        }

        const config = {
            ...storedConfig,
            smtpEnabled: storedConfig.smtpEnabled !== false,
            smtpAdminOnly: !!storedConfig.smtpAdminOnly,
            smtpHost,
            smtpPort: parseInt(smtpPort, 10) || 587,
            smtpUser: effectiveSmtpUser,
            smtpPass: effectiveSmtpPass,
            smtpFrom,
            smtpSecure: !!smtpSecure,
        };

        try {
            log(`Sending mock email catalog to ${testRecipient}...`);
            const result = await sendMockEmailCatalog({
                sendEmail,
                config,
                to: testRecipient,
                log,
            });
            if (result.failed) {
                return res.status(500).json({
                    error: `Sent ${result.sent} mock emails; ${result.failed} failed.`,
                    ...result,
                });
            }
            res.json({
                message: `Sent ${result.sent} mock emails to ${result.to}.`,
                ...result,
            });
        } catch (error) {
            log(`Failed to send mock emails: ${error.message}`);
            res.status(error.statusCode || 500).json({ error: clientErrorMessage(error, 'Mock email sweep failed.') });
        }
    });
};
