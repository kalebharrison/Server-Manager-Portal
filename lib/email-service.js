import fs from 'fs/promises';
import path from 'path';
import nodemailer from 'nodemailer';

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
    const hasEmailBeenSent = async (userId, type, uniqueKey) => {
        try {
            const logs = await loadFile(emailLogPath, []);
            return logs.some(l => l.userId === String(userId) && l.type === type && l.uniqueKey === String(uniqueKey));
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

    const sendEmail = async (config, to, subject, html, customTransporter = null) => {
        if (!config.smtpHost || !config.smtpUser || !config.smtpPass) {
            log('SMTP is not fully configured. Skipping email send.');
            return false;
        }

        const transporter = customTransporter || nodemailer.createTransport({
            host: config.smtpHost,
            port: parseInt(config.smtpPort, 10) || 587,
            secure: !!config.smtpSecure,
            auth: {
                user: config.smtpUser,
                pass: config.smtpPass,
            },
        });

        const logoPath = path.join(process.cwd(), 'static', 'logo.png');
        let hasLogo = false;
        try {
            await fs.access(logoPath);
            hasLogo = true;
        } catch (e) {
            // Logo doesn't exist
        }

        const mailOptions = {
            from: config.smtpFrom || config.smtpUser,
            to,
            subject,
            html,
            attachments: hasLogo ? [{
                filename: 'logo.png',
                path: logoPath,
                cid: 'logo'
            }] : []
        };

        try {
            const info = await transporter.sendMail(mailOptions);
            log(`Email sent successfully: ${info.messageId}`);
            const users = await loadFile(usersPath, []);
            const foundUser = users.find(u => u.email === to);
            const targetUsername = foundUser ? foundUser.username : 'Recipient';
            await appendAuditLog('system_email_sent', { username: 'System', email: config.smtpFrom || config.smtpUser }, { username: targetUsername, email: to }, { subject });
            return true;
        } catch (error) {
            log(`Error sending email to ${to}: ${error.message}`);
            throw error;
        }
    };

    const checkAndSendNotifications = async (config) => {
        if (!config.smtpHost || !config.smtpUser || !config.smtpPass) {
            return;
        }

        log('Checking for users to notify about upcoming expiry...');
        const users = await loadFile(usersPath, []);
        const daysBefore = parseInt(config.emailDaysBefore, 10) || 7;

        const logoPath = path.join(process.cwd(), 'static', 'logo.png');
        let hasLogo = false;
        try {
            await fs.access(logoPath);
            hasLogo = true;
        } catch (e) { }

        for (const user of users) {
            if (!user.expiryDate || user.plexAccessStatus === 'revoked' || !user.email) {
                continue;
            }

            const days = getDaysUntilExpiry(user.expiryDate);
            if (days === null || days > daysBefore || days < 0) continue;

            const alreadySent = await hasEmailBeenSent(user.id, 'expiry_warning', user.expiryDate);
            if (alreadySent) continue;

            log(`Sending expiry warning to ${user.username} (${user.email}) - ${days} days remaining.`);
            const subject = `[Plex Server] Your shared access expires in ${days} day${days === 1 ? '' : 's'}`;
            const html = `
                <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f6f9; padding: 30px; color: #333333; line-height: 1.6;">
                    <div style="max-width: 600px; margin: auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.05); border-top: 6px solid #e5a00d;">
                        <div style="background-color: #282A2D; padding: 25px; text-align: center;">
                            ${hasLogo ? '<img src="cid:logo" alt="Logo" style="max-height: 100px; display: block; margin: 0 auto 10px auto;" />' : ''}
                            <h1 style="color: #ffffff; margin: 0; font-size: 26px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase;">PLEX SERVER</h1>
                        </div>
                        <div style="padding: 30px 40px;">
                            <h2 style="color: #282A2D; font-size: 20px; margin-top: 0; font-weight: 600;">Access Expiry Notification</h2>
                            <p>Hello <strong>${user.username}</strong>,</p>
                            <p>This is a notification that your shared access to the Plex media server is coming to an end soon. Below are your account details:</p>
                            
                            <div style="background-color: #fcf8f2; border-left: 4px solid #e5a00d; padding: 20px; margin: 25px 0; border-radius: 6px;">
                                <table style="width: 100%; border-collapse: collapse; font-size: 15px;">
                                    <tr>
                                        <td style="padding: 6px 0; color: #718096; font-weight: 500;">Plex Username:</td>
                                        <td style="padding: 6px 0; color: #2d3748; font-weight: bold; text-align: right;">${user.username}</td>
                                    </tr>
                                    <tr>
                                        <td style="padding: 6px 0; color: #718096; font-weight: 500;">Expiry Date:</td>
                                        <td style="padding: 6px 0; color: #e5a00d; font-weight: bold; text-align: right;">${new Date(user.expiryDate).toLocaleDateString(undefined, { dateStyle: 'long' })}</td>
                                    </tr>
                                    <tr>
                                        <td style="padding: 6px 0; color: #718096; font-weight: 500;">Time Remaining:</td>
                                        <td style="padding: 6px 0; color: #e5a00d; font-weight: bold; text-align: right;">${days} day${days === 1 ? '' : 's'}</td>
                                    </tr>
                                </table>
                            </div>

                            <p>To ensure uninterrupted streaming of your favorite movies and shows, please get in touch with the server owner to renew your access before the expiry date.</p>
                            
                            <div style="text-align: center; margin: 35px 0 15px 0;">
                                <a href="${config.contactUrl || 'mailto:' + (config.smtpFrom || config.smtpUser)}" style="background-color: #e5a00d; color: #ffffff; text-decoration: none; padding: 14px 35px; font-weight: bold; border-radius: 6px; display: inline-block; font-size: 16px; box-shadow: 0 4px 6px rgba(229, 160, 13, 0.2);">Request Extension</a>
                            </div>
                        </div>
                        <div style="background-color: #f7fafc; padding: 20px 30px; border-top: 1px solid #edf2f7; text-align: center; font-size: 12px; color: #a0aec0;">
                            <p style="margin: 0 0 5px 0;">Automated alert from the Plex Expiry Service.</p>
                            <p style="margin: 0;">Please contact the administrator for any access queries.</p>
                        </div>
                    </div>
                </div>
            `;

            try {
                const sent = await sendEmail(config, user.email, subject, html);
                if (sent) {
                    await logEmailSent(user.id, 'expiry_warning', user.expiryDate);
                }
            } catch (err) {
                log(`Failed to send email to ${user.username}: ${err.message}`);
            }
        }
    };

    const sendExpiryEmail = async (config, user, hasLogo) => {
        if (!user.email) {
            log(`No email address for ${user.username}. Skipping expiry notification.`);
            return false;
        }

        const alreadySent = await hasEmailBeenSent(user.id, 'access_expired', user.expiryDate || 'none');
        if (alreadySent) return true;

        const subject = `[Plex Server] Your shared access has expired`;
        const html = `
            <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f6f9; padding: 30px; color: #333333; line-height: 1.6;">
                <div style="max-width: 600px; margin: auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.05); border-top: 6px solid #e53e3e;">
                    <div style="background-color: #282A2D; padding: 25px; text-align: center;">
                        ${hasLogo ? '<img src="cid:logo" alt="Logo" style="max-height: 100px; display: block; margin: 0 auto 10px auto;" />' : ''}
                        <h1 style="color: #ffffff; margin: 0; font-size: 26px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase;">PLEX SERVER</h1>
                    </div>
                    <div style="padding: 30px 40px;">
                        <h2 style="color: #e53e3e; font-size: 20px; margin-top: 0; font-weight: 600;">Access Expired</h2>
                        <p>Hello <strong>${user.username}</strong>,</p>
                        <p>We're writing to let you know that your shared access to the Plex media server has <strong style="color: #e53e3e;">expired</strong> and your account has been removed from the server.</p>
                        
                        <div style="background-color: #fff5f5; border-left: 4px solid #e53e3e; padding: 20px; margin: 25px 0; border-radius: 6px;">
                            <table style="width: 100%; border-collapse: collapse; font-size: 15px;">
                                <tr>
                                    <td style="padding: 6px 0; color: #718096; font-weight: 500;">Plex Username:</td>
                                    <td style="padding: 6px 0; color: #2d3748; font-weight: bold; text-align: right;">${user.username}</td>
                                </tr>
                                <tr>
                                    <td style="padding: 6px 0; color: #718096; font-weight: 500;">Expiry Date:</td>
                                    <td style="padding: 6px 0; color: #e53e3e; font-weight: bold; text-align: right;">${new Date(user.expiryDate).toLocaleDateString(undefined, { dateStyle: 'long' })}</td>
                                </tr>
                                <tr>
                                    <td style="padding: 6px 0; color: #718096; font-weight: 500;">Status:</td>
                                    <td style="padding: 6px 0; color: #e53e3e; font-weight: bold; text-align: right;">Access Revoked</td>
                                </tr>
                            </table>
                        </div>

                        ${config.contactEmail || config.contactWhatsApp ? `
                        <p style="font-size: 16px; font-weight: 600; color: #282A2D; margin-bottom: 5px;">Want to renew your access?</p>
                        <p>If you'd like to continue enjoying all the content, simply get in touch using any of the methods below and we'll get you set up again:</p>

                        <div style="background-color: #fcf8f2; border-radius: 8px; padding: 20px; margin: 20px 0;">
                            <table style="width: 100%; border-collapse: collapse; font-size: 15px;">
                                ${config.contactEmail ? `<tr>
                                    <td style="padding: 10px 0; vertical-align: middle;">
                                        <span style="font-size: 20px; margin-right: 10px;">📧</span>
                                        <strong style="color: #2d3748;">Email:</strong>
                                    </td>
                                    <td style="padding: 10px 0; text-align: right; vertical-align: middle;">
                                        <a href="mailto:${escapeHtmlAttr(config.contactEmail)}" style="color: #e5a00d; text-decoration: none; font-weight: 600;">${escapeHtmlAttr(config.contactEmail)}</a>
                                    </td>
                                </tr>` : ''}
                                ${config.contactWhatsApp ? `<tr>
                                    <td style="padding: 10px 0; vertical-align: middle; border-top: 1px solid #edf2f7;">
                                        <span style="font-size: 20px; margin-right: 10px;">💬</span>
                                        <strong style="color: #2d3748;">WhatsApp:</strong>
                                    </td>
                                    <td style="padding: 10px 0; text-align: right; vertical-align: middle; border-top: 1px solid #edf2f7;">
                                        <a href="https://wa.me/${escapeHtmlAttr(String(config.contactWhatsApp).replace(/\D/g, ''))}" style="color: #25d366; text-decoration: none; font-weight: 600;">${escapeHtmlAttr(config.contactWhatsApp)}</a>
                                    </td>
                                </tr>` : ''}
                            </table>
                        </div>

                        <div style="text-align: center; margin: 30px 0 15px 0;">
                            ${config.contactWhatsApp ? `<a href="https://wa.me/${escapeHtmlAttr(String(config.contactWhatsApp).replace(/\D/g, ''))}" style="background-color: #25d366; color: #ffffff; text-decoration: none; padding: 14px 35px; font-weight: bold; border-radius: 6px; display: inline-block; font-size: 16px; box-shadow: 0 4px 6px rgba(37, 211, 102, 0.2); margin-right: 10px;">WhatsApp Me</a>` : ''}
                            ${config.contactEmail ? `<a href="mailto:${escapeHtmlAttr(config.contactEmail)}" style="background-color: #e5a00d; color: #ffffff; text-decoration: none; padding: 14px 35px; font-weight: bold; border-radius: 6px; display: inline-block; font-size: 16px; box-shadow: 0 4px 6px rgba(229, 160, 13, 0.2);">Email Me</a>` : ''}
                        </div>` : ''}
                    </div>
                    <div style="background-color: #f7fafc; padding: 20px 30px; border-top: 1px solid #edf2f7; text-align: center; font-size: 12px; color: #a0aec0;">
                        <p style="margin: 0 0 5px 0;">Automated notification from the Plex Expiry Service.</p>
                        <p style="margin: 0;">We'd love to have you back — don't hesitate to reach out!</p>
                    </div>
                </div>
            </div>
        `;

        try {
            const sent = await sendEmail(config, user.email, subject, html);
            if (sent) {
                log(`Expiry notification email sent to ${user.username} (${user.email}).`);
                await logEmailSent(user.id, 'access_expired', user.expiryDate || 'none');
            }
            return sent;
        } catch (err) {
            log(`Failed to send expiry notification to ${user.username}: ${err.message}`);
            return false;
        }
    };

    const sendAdjustmentEmail = async (config, user, hasLogo) => {
        if (!user.email) return false;

        const subject = `[Plex Server] Your access has been updated`;
        const days = getDaysUntilExpiry(user.expiryDate);
        const html = `
            <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f6f9; padding: 30px; color: #333333; line-height: 1.6;">
                <div style="max-width: 600px; margin: auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.05); border-top: 6px solid #e5a00d;">
                    <div style="background-color: #282A2D; padding: 25px; text-align: center;">
                        ${hasLogo ? '<img src="cid:logo" alt="Logo" style="max-height: 100px; display: block; margin: 0 auto 10px auto;" />' : ''}
                        <h1 style="color: #ffffff; margin: 0; font-size: 26px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase;">PLEX SERVER</h1>
                    </div>
                    <div style="padding: 30px 40px;">
                        <h2 style="color: #282A2D; font-size: 20px; margin-top: 0; font-weight: 600;">Access Updated</h2>
                        <p>Hello <strong>${user.username}</strong>,</p>
                        <p>Your access to the Plex media server has been successfully updated. Here are your new account details:</p>
                        
                        <div style="background-color: #fcf8f2; border-left: 4px solid #e5a00d; padding: 20px; margin: 25px 0; border-radius: 6px;">
                            <table style="width: 100%; border-collapse: collapse; font-size: 15px;">
                                <tr>
                                    <td style="padding: 6px 0; color: #718096; font-weight: 500;">Plex Username:</td>
                                    <td style="padding: 6px 0; color: #2d3748; font-weight: bold; text-align: right;">${user.username}</td>
                                </tr>
                                <tr>
                                    <td style="padding: 6px 0; color: #718096; font-weight: 500;">New Expiry Date:</td>
                                    <td style="padding: 6px 0; color: #e5a00d; font-weight: bold; text-align: right;">${user.expiryDate ? new Date(user.expiryDate).toLocaleDateString(undefined, { dateStyle: 'long' }) : 'Unlimited'}</td>
                                </tr>
                                ${days !== null ? `
                                <tr>
                                    <td style="padding: 6px 0; color: #718096; font-weight: 500;">Time Remaining:</td>
                                    <td style="padding: 6px 0; color: #e5a00d; font-weight: bold; text-align: right;">${days} day${days === 1 ? '' : 's'}</td>
                                </tr>` : ''}
                            </table>
                        </div>

                        <p>Thank you for continuing to be a part of our community!</p>
                    </div>
                    <div style="background-color: #f7fafc; padding: 20px 30px; border-top: 1px solid #edf2f7; text-align: center; font-size: 12px; color: #a0aec0;">
                        <p style="margin: 0 0 5px 0;">Automated notification from the Plex Expiry Service.</p>
                    </div>
                </div>
            </div>
        `;

        try {
            const sent = await sendEmail(config, user.email, subject, html);
            if (sent) {
                log(`Expiry notification email sent to ${user.username} (${user.email}).`);
            }
            return sent;
        } catch (err) {
            log(`Failed to send expiry notification to ${user.username}: ${err.message}`);
            return false;
        }
    };

    return {
        hasEmailBeenSent,
        logEmailSent,
        sendEmail,
        checkAndSendNotifications,
        sendExpiryEmail,
        sendAdjustmentEmail,
    };
};
