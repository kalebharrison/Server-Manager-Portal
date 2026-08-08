import { resolveDisplayName, resolveLocale } from '../users/user-profile.js';

export const PORTAL_EMAIL_ACCENT = '#e5a00d';
export const PORTAL_EMAIL_ACCENT_DANGER = '#e53e3e';

/** Compact table chrome. No inline logo — unused CID attachments dump as giant images in Gmail. */
export const buildPortalEmailHtml = ({
    title,
    bodyHtml,
    footer = 'Server Portal',
    heading = 'Server Portal',
    accent = PORTAL_EMAIL_ACCENT,
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
          <tr><td bgcolor="${accent}" height="6" style="font-size:0;line-height:0;height:6px;">&nbsp;</td></tr>
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

export const buildEmailInfoTable = (rows = [], { accent = PORTAL_EMAIL_ACCENT } = {}) => {
    const safeRows = rows.filter((row) => Array.isArray(row) && row[0]);
    if (!safeRows.length) return '';
    const bg = accent === PORTAL_EMAIL_ACCENT_DANGER ? '#fff5f5' : '#fcf8f2';
    const valueColor = accent === PORTAL_EMAIL_ACCENT_DANGER ? PORTAL_EMAIL_ACCENT_DANGER : '#2d3748';
    return `<div style="background-color:${bg};border-left:4px solid ${accent};padding:16px;margin:16px 0;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;font-size:15px;">
        ${safeRows.map(([label, value]) => `<tr>
          <td style="padding:6px 0;color:#718096;">${label}</td>
          <td style="padding:6px 0;color:${valueColor};font-weight:bold;text-align:right;">${value}</td>
        </tr>`).join('')}
      </table>
    </div>`;
};

export const buildEmailButton = (href, label) => `
  <p style="margin:20px 0 0;text-align:center;">
    <a href="${href}" style="background-color:${PORTAL_EMAIL_ACCENT};color:#ffffff;text-decoration:none;padding:12px 28px;font-weight:bold;border-radius:6px;display:inline-block;">${label}</a>
  </p>`;

export const wrapBroadcastEmailHtml = ({ subject, bodyHtml, serverName } = {}) => buildPortalEmailHtml({
    heading: serverName || 'Server Portal',
    title: subject || 'Server broadcast',
    bodyHtml,
    footer: 'Server broadcast',
});

export const buildAnnouncementEmailHtml = ({ text, serverName } = {}) => {
    const safeServer = serverName || 'the server';
    return buildPortalEmailHtml({
        heading: safeServer,
        title: 'Server announcement',
        bodyHtml: `
          <div style="background-color:#fcf8f2;border-left:4px solid ${PORTAL_EMAIL_ACCENT};padding:16px;margin:0 0 16px;">
            <p style="margin:0;white-space:pre-wrap;">${text || ''}</p>
          </div>
          <p style="margin:0;color:#718096;font-size:13px;">You are receiving this because you are an active user on ${safeServer}.</p>
        `,
        footer: 'Server announcement',
    });
};

export const buildMediaIssueReportHtml = ({ username, title, key, issue } = {}) => buildPortalEmailHtml({
    title: 'Playback issue report',
    bodyHtml: `
      <p style="margin:0 0 12px;"><strong>${username || 'A member'}</strong> reported a playback issue.</p>
      ${buildEmailInfoTable([
          ['Media', title || 'Unknown'],
          key ? ['Key', key] : null,
      ])}
      <p style="margin:16px 0 8px;color:#718096;font-weight:600;">Note</p>
      <div style="background-color:#fcf8f2;border-left:4px solid ${PORTAL_EMAIL_ACCENT};padding:16px;">${issue || ''}</div>
    `,
    footer: 'Playback issue report',
});

export const buildSmtpTestHtml = () => buildPortalEmailHtml({
    title: 'SMTP test successful',
    bodyHtml: `
      <p style="margin:0 0 12px;">Server Portal can send mail with the saved SMTP settings.</p>
      <p style="margin:0;">If <strong>Admins only</strong> is on, members will not get request, issue, or expiry mail.</p>
    `,
    footer: 'Server Portal SMTP test',
});

export const buildExpiryWarningHtml = ({ user, config, days, escapeHtmlAttr }) => {
    const locale = resolveLocale(user);
    const contactHref = escapeHtmlAttr(config.contactUrl || (`mailto:${config.smtpFrom || config.smtpUser || ''}`));
    return buildPortalEmailHtml({
        heading: config.serverIdentifier || 'Server Portal',
        title: 'Access expires soon',
        footer: 'Access expiry notice',
        bodyHtml: `
          <p style="margin:0 0 12px;">Hello <strong>${escapeHtmlAttr(resolveDisplayName(user))}</strong>,</p>
          <p style="margin:0;">Your shared access is ending soon. Renew before the date below to keep streaming.</p>
          ${buildEmailInfoTable([
              ['Username', escapeHtmlAttr(user.username || '')],
              ['Expiry date', new Date(user.expiryDate).toLocaleDateString(locale, { dateStyle: 'long' })],
              ['Time remaining', `${days} day${days === 1 ? '' : 's'}`],
          ])}
          ${buildEmailButton(contactHref, 'Request extension')}
        `,
    });
};

export const buildAccessExpiredHtml = ({ user, config, escapeHtmlAttr }) => {
    const locale = resolveLocale(user);
    const contact = config.contactEmail ? escapeHtmlAttr(config.contactEmail) : '';
    return buildPortalEmailHtml({
        heading: config.serverIdentifier || 'Server Portal',
        title: 'Access expired',
        accent: PORTAL_EMAIL_ACCENT_DANGER,
        footer: 'Access expiry notice',
        bodyHtml: `
          <p style="margin:0 0 12px;">Hello <strong>${escapeHtmlAttr(resolveDisplayName(user))}</strong>,</p>
          <p style="margin:0;">Your shared access has <strong style="color:${PORTAL_EMAIL_ACCENT_DANGER};">expired</strong> and your account was removed from the server.</p>
          ${buildEmailInfoTable([
              ['Username', escapeHtmlAttr(user.username || '')],
              ['Expiry date', new Date(user.expiryDate).toLocaleDateString(locale, { dateStyle: 'long' })],
              ['Status', 'Access revoked'],
          ], { accent: PORTAL_EMAIL_ACCENT_DANGER })}
          ${contact ? `
            <p style="margin:16px 0 0;">Want to renew? Email <a href="mailto:${contact}" style="color:${PORTAL_EMAIL_ACCENT};text-decoration:none;font-weight:600;">${contact}</a>.</p>
            ${buildEmailButton(`mailto:${contact}`, 'Email the owner')}
          ` : ''}
        `,
    });
};

export const buildAccessAdjustmentHtml = ({ user, escapeHtmlAttr, getDaysUntilExpiry, config = {} }) => {
    const days = getDaysUntilExpiry(user.expiryDate);
    const locale = resolveLocale(user);
    return buildPortalEmailHtml({
        heading: config.serverIdentifier || 'Server Portal',
        title: 'Access updated',
        footer: 'Access update notice',
        bodyHtml: `
          <p style="margin:0 0 12px;">Hello <strong>${escapeHtmlAttr(resolveDisplayName(user))}</strong>,</p>
          <p style="margin:0;">Your access was updated. Here are the new details:</p>
          ${buildEmailInfoTable([
              ['Username', escapeHtmlAttr(user.username || '')],
              ['New expiry date', user.expiryDate ? new Date(user.expiryDate).toLocaleDateString(locale, { dateStyle: 'long' }) : 'Unlimited'],
              days !== null ? ['Time remaining', `${days} day${days === 1 ? '' : 's'}`] : null,
          ])}
          <p style="margin:16px 0 0;">Thanks for staying with the server.</p>
        `,
    });
};
