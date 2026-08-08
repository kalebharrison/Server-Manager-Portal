import { resolveDisplayName, resolveLocale } from '../users/user-profile.js';

/** Compact table chrome. No inline logo — unused CID attachments dump as giant images in Gmail. */
export const buildPortalEmailHtml = ({
    title,
    bodyHtml,
    footer = 'Server Portal',
    heading = 'Server Portal',
} = {}) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
</head>
<body style="margin:0;padding:0;background-color:#f4f6f9;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#f4f6f9" style="background-color:#f4f6f9;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" width="560" cellspacing="0" cellpadding="0" border="0" bgcolor="#ffffff" style="background-color:#ffffff;border-collapse:collapse;">
          <tr><td bgcolor="#e5a00d" height="6" style="font-size:0;line-height:0;height:6px;">&nbsp;</td></tr>
          <tr>
            <td style="padding:20px 28px 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#282A2D;font-weight:bold;">
              ${heading}
            </td>
          </tr>
          <tr>
            <td style="padding:12px 28px 8px;font-family:Arial,Helvetica,sans-serif;font-size:20px;line-height:1.3;color:#282A2D;font-weight:bold;">
              ${title}
            </td>
          </tr>
          <tr>
            <td style="padding:0 28px 20px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#333333;">
              ${bodyHtml}
            </td>
          </tr>
          <tr>
            <td bgcolor="#f7fafc" style="padding:14px 28px;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#718096;background-color:#f7fafc;border-top:1px solid #edf2f7;">
              ${footer}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

export const buildSmtpTestHtml = () => buildPortalEmailHtml({
    title: 'SMTP test successful',
    bodyHtml: `
      <p style="margin:0 0 12px;">Server Portal can send mail with the saved SMTP settings.</p>
      <p style="margin:0;">If <strong>Admins only</strong> is on, members will not get request, issue, or expiry mail.</p>
    `,
    footer: 'Server Portal SMTP test',
});

export const buildExpiryWarningHtml = ({ user, config, days, hasLogo, escapeHtmlAttr }) => {
    const locale = resolveLocale(user);
    return `
                <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f6f9; padding: 30px; color: #333333; line-height: 1.6;">
                    <div style="max-width: 600px; margin: auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.05); border-top: 6px solid #e5a00d;">
                        <div style="background-color: #282A2D; padding: 25px; text-align: center;">
                            ${hasLogo ? '<img src="cid:logo" alt="Logo" style="max-height: 100px; display: block; margin: 0 auto 10px auto;" />' : ''}
                            <h1 style="color: #ffffff; margin: 0; font-size: 26px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase;">PLEX SERVER</h1>
                        </div>
                        <div style="padding: 30px 40px;">
                            <h2 style="color: #282A2D; font-size: 20px; margin-top: 0; font-weight: 600;">Access Expiry Notification</h2>
                            <p>Hello <strong>${escapeHtmlAttr(resolveDisplayName(user))}</strong>,</p>
                            <p>This is a notification that your shared access to the Plex media server is coming to an end soon. Below are your account details:</p>
                            
                            <div style="background-color: #fcf8f2; border-left: 4px solid #e5a00d; padding: 20px; margin: 25px 0; border-radius: 6px;">
                                <table style="width: 100%; border-collapse: collapse; font-size: 15px;">
                                    <tr>
                                        <td style="padding: 6px 0; color: #718096; font-weight: 500;">Plex Username:</td>
                                        <td style="padding: 6px 0; color: #2d3748; font-weight: bold; text-align: right;">${escapeHtmlAttr(user.username || '')}</td>
                                    </tr>
                                    <tr>
                                        <td style="padding: 6px 0; color: #718096; font-weight: 500;">Expiry Date:</td>
                                        <td style="padding: 6px 0; color: #e5a00d; font-weight: bold; text-align: right;">${new Date(user.expiryDate).toLocaleDateString(locale, { dateStyle: 'long' })}</td>
                                    </tr>
                                    <tr>
                                        <td style="padding: 6px 0; color: #718096; font-weight: 500;">Time Remaining:</td>
                                        <td style="padding: 6px 0; color: #e5a00d; font-weight: bold; text-align: right;">${days} day${days === 1 ? '' : 's'}</td>
                                    </tr>
                                </table>
                            </div>

                            <p>To ensure uninterrupted streaming of your favorite movies and shows, please get in touch with the server owner to renew your access before the expiry date.</p>
                            
                            <div style="text-align: center; margin: 35px 0 15px 0;">
                                <a href="${escapeHtmlAttr(config.contactUrl || ('mailto:' + (config.smtpFrom || config.smtpUser || '')))}" style="background-color: #e5a00d; color: #ffffff; text-decoration: none; padding: 14px 35px; font-weight: bold; border-radius: 6px; display: inline-block; font-size: 16px; box-shadow: 0 4px 6px rgba(229, 160, 13, 0.2);">Request Extension</a>
                            </div>
                        </div>
                        <div style="background-color: #f7fafc; padding: 20px 30px; border-top: 1px solid #edf2f7; text-align: center; font-size: 12px; color: #a0aec0;">
                            <p style="margin: 0 0 5px 0;">Automated alert from the Plex Expiry Service.</p>
                            <p style="margin: 0;">Manage email preferences anytime in your User Portal.</p>
                        </div>
                    </div>
                </div>
            `;
};

export const buildAccessExpiredHtml = ({ user, config, hasLogo, escapeHtmlAttr }) => `
            <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f6f9; padding: 30px; color: #333333; line-height: 1.6;">
                <div style="max-width: 600px; margin: auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.05); border-top: 6px solid #e53e3e;">
                    <div style="background-color: #282A2D; padding: 25px; text-align: center;">
                        ${hasLogo ? '<img src="cid:logo" alt="Logo" style="max-height: 100px; display: block; margin: 0 auto 10px auto;" />' : ''}
                        <h1 style="color: #ffffff; margin: 0; font-size: 26px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase;">PLEX SERVER</h1>
                    </div>
                    <div style="padding: 30px 40px;">
                        <h2 style="color: #e53e3e; font-size: 20px; margin-top: 0; font-weight: 600;">Access Expired</h2>
                        <p>Hello <strong>${escapeHtmlAttr(resolveDisplayName(user))}</strong>,</p>
                        <p>We're writing to let you know that your shared access to the Plex media server has <strong style="color: #e53e3e;">expired</strong> and your account has been removed from the server.</p>
                        
                        <div style="background-color: #fff5f5; border-left: 4px solid #e53e3e; padding: 20px; margin: 25px 0; border-radius: 6px;">
                            <table style="width: 100%; border-collapse: collapse; font-size: 15px;">
                                <tr>
                                    <td style="padding: 6px 0; color: #718096; font-weight: 500;">Plex Username:</td>
                                    <td style="padding: 6px 0; color: #2d3748; font-weight: bold; text-align: right;">${escapeHtmlAttr(user.username || '')}</td>
                                </tr>
                                <tr>
                                    <td style="padding: 6px 0; color: #718096; font-weight: 500;">Expiry Date:</td>
                                    <td style="padding: 6px 0; color: #e53e3e; font-weight: bold; text-align: right;">${new Date(user.expiryDate).toLocaleDateString(resolveLocale(user), { dateStyle: 'long' })}</td>
                                </tr>
                                <tr>
                                    <td style="padding: 6px 0; color: #718096; font-weight: 500;">Status:</td>
                                    <td style="padding: 6px 0; color: #e53e3e; font-weight: bold; text-align: right;">Access Revoked</td>
                                </tr>
                            </table>
                        </div>

                        ${config.contactEmail ? `
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
                            </table>
                        </div>

                        <div style="text-align: center; margin: 30px 0 15px 0;">
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

export const buildAccessAdjustmentHtml = ({ user, hasLogo, escapeHtmlAttr, getDaysUntilExpiry }) => {
    const days = getDaysUntilExpiry(user.expiryDate);
    return `
            <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f6f9; padding: 30px; color: #333333; line-height: 1.6;">
                <div style="max-width: 600px; margin: auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.05); border-top: 6px solid #e5a00d;">
                    <div style="background-color: #282A2D; padding: 25px; text-align: center;">
                        ${hasLogo ? '<img src="cid:logo" alt="Logo" style="max-height: 100px; display: block; margin: 0 auto 10px auto;" />' : ''}
                        <h1 style="color: #ffffff; margin: 0; font-size: 26px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase;">PLEX SERVER</h1>
                    </div>
                    <div style="padding: 30px 40px;">
                        <h2 style="color: #282A2D; font-size: 20px; margin-top: 0; font-weight: 600;">Access Updated</h2>
                        <p>Hello <strong>${escapeHtmlAttr(resolveDisplayName(user))}</strong>,</p>
                        <p>Your access to the Plex media server has been successfully updated. Here are your new account details:</p>
                        
                        <div style="background-color: #fcf8f2; border-left: 4px solid #e5a00d; padding: 20px; margin: 25px 0; border-radius: 6px;">
                            <table style="width: 100%; border-collapse: collapse; font-size: 15px;">
                                <tr>
                                    <td style="padding: 6px 0; color: #718096; font-weight: 500;">Plex Username:</td>
                                    <td style="padding: 6px 0; color: #2d3748; font-weight: bold; text-align: right;">${escapeHtmlAttr(user.username || '')}</td>
                                </tr>
                                <tr>
                                    <td style="padding: 6px 0; color: #718096; font-weight: 500;">New Expiry Date:</td>
                                    <td style="padding: 6px 0; color: #e5a00d; font-weight: bold; text-align: right;">${user.expiryDate ? new Date(user.expiryDate).toLocaleDateString(resolveLocale(user), { dateStyle: 'long' }) : 'Unlimited'}</td>
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
};
