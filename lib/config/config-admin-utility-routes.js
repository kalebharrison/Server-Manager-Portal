import express from 'express';
import fs from 'fs/promises';
import path from 'path';

import { clientErrorMessage } from '../http/safe-client-error.js';

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
            smtpHost,
            smtpPort: parseInt(smtpPort, 10) || 587,
            smtpUser: effectiveSmtpUser,
            smtpPass: effectiveSmtpPass,
            smtpFrom,
            smtpSecure: !!smtpSecure,
        };

        const logoPath = path.join(process.cwd(), 'static', 'logo.png');
        let hasLogo = false;
        try {
            await fs.access(logoPath);
            hasLogo = true;
        } catch (e) { }

        try {
            log(`Sending test email to ${testRecipient}...`);
            await sendEmail(
                config,
                testRecipient,
                '[Plex Server] Test Email Connection',
                `
                <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f6f9; padding: 30px; color: #333333; line-height: 1.6;">
                    <div style="max-width: 600px; margin: auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.05); border-top: 6px solid #e5a00d;">
                        <div style="background-color: #282A2D; padding: 25px; text-align: center;">
                            ${hasLogo ? '<img src="cid:logo" alt="Logo" style="max-height: 100px; display: block; margin: 0 auto 10px auto;" />' : ''}
                            <h1 style="color: #ffffff; margin: 0; font-size: 26px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase;">PLEX SERVER</h1>
                        </div>
                        <div style="padding: 30px 40px;">
                            <h2 style="color: #282A2D; font-size: 20px; margin-top: 0; font-weight: 600; text-align: center;">SMTP Test Successful</h2>
                            <p>This is a test notification confirming that the Plex SMTP server parameters are active and communicating successfully.</p>
                            <p>Automated expiry notifications will use this template design to contact shared members before access revocation.</p>
                        </div>
                        <div style="background-color: #f7fafc; padding: 20px 30px; border-top: 1px solid #edf2f7; text-align: center; font-size: 12px; color: #a0aec0;">
                            <p style="margin: 0;">Automated alert from the Plex Expiry Service.</p>
                        </div>
                    </div>
                </div>
                `
            );
            res.json({ message: 'Test email sent successfully!' });
        } catch (error) {
            log(`Failed to send test email: ${error.message}`);
            res.status(500).json({ error: clientErrorMessage(error, 'SMTP test failed.') });
        }
    });
};
