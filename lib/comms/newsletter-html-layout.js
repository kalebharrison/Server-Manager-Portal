import { escapeHtmlAttr } from '../http/html-shell.js';
import { EMAIL_PRODUCT_NAME, buildPortalPreferencesUrl, resolveEmailServerName } from './email-identity.js';
import { buildPortalEmailHtml } from './email-templates.js';

export const buildNewsletterHtmlDocument = ({ htmlContent, serverName, config } = {}) => {
    const name = escapeHtmlAttr(serverName || resolveEmailServerName(config));
    return buildPortalEmailHtml({
        heading: name,
        title: "What's new",
        bodyHtml: String(htmlContent || '').replace(/{{SERVER_NAME}}/g, name),
        footer: `${name} · ${EMAIL_PRODUCT_NAME}`,
    });
};

export const buildNewsletterBodyContent = ({ recentHtml, uptimeStr, stats, publicDomain, config } = {}) => {
    const preferencesUrl = buildPortalPreferencesUrl({ publicDomain, ...config });
    const portalLabel = EMAIL_PRODUCT_NAME;
    const prefsLink = preferencesUrl
        ? `<a href="${escapeHtmlAttr(preferencesUrl)}" style="color:#e5a00d;font-weight:600;text-decoration:underline;">${portalLabel} preferences</a>`
        : `${portalLabel} preferences`;
    return `
  <p style="margin:0 0 16px;">Hello <strong>{{USERNAME}}</strong>, here is what is happening on <strong>{{SERVER_NAME}}</strong>.</p>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 20px;border-collapse:collapse;">
    <tr>
      <td width="48%" valign="top" style="padding:14px;background-color:#f7fafc;border:1px solid #edf2f7;">
        <p style="margin:0;color:#718096;font-size:12px;">30-day uptime</p>
        <p style="margin:8px 0 0;color:#16a34a;font-size:22px;font-weight:bold;">${escapeHtmlAttr(uptimeStr)}</p>
      </td>
      <td width="4%" style="font-size:0;line-height:0;">&nbsp;</td>
      <td width="48%" valign="top" style="padding:14px;background-color:#f7fafc;border:1px solid #edf2f7;">
        <p style="margin:0;color:#718096;font-size:12px;">Library size</p>
        <p style="margin:8px 0 0;color:#282A2D;font-size:15px;"><strong>${escapeHtmlAttr(String(stats.movies ?? 0))}</strong> movies</p>
        <p style="margin:4px 0 0;color:#282A2D;font-size:15px;"><strong>${escapeHtmlAttr(String(stats.shows ?? 0))}</strong> TV shows</p>
      </td>
    </tr>
  </table>
  ${recentHtml || '<p style="margin:0;color:#718096;">No recently added titles to show.</p>'}
  <p style="margin:20px 0 0;color:#718096;font-size:13px;">Manage or unsubscribe anytime in ${prefsLink}.</p>
`;
};
