import { escapeHtmlAttr } from '../http/html-shell.js';
import { buildPortalEmailHtml } from './email-templates.js';

export const buildNewsletterHtmlDocument = ({ htmlContent, serverName }) => {
    const safeServerName = escapeHtmlAttr(serverName || 'Server Portal');
    return buildPortalEmailHtml({
        heading: safeServerName,
        title: 'Server newsletter',
        bodyHtml: String(htmlContent || '').replace(/{{SERVER_NAME}}/g, safeServerName),
        footer: 'Automated newsletter from Server Portal',
    });
};

export const buildNewsletterBodyContent = ({ recentHtml, uptimeStr, stats, publicDomain }) => `
  <p style="margin:0 0 16px;">Hello <strong>{{USERNAME}}</strong>, here is what is happening on <strong>{{SERVER_NAME}}</strong>.</p>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 20px;border-collapse:collapse;">
    <tr>
      <td width="48%" valign="top" style="padding:14px;background-color:#f7fafc;border:1px solid #edf2f7;">
        <p style="margin:0;color:#718096;font-size:12px;text-transform:uppercase;letter-spacing:1px;">30-day uptime</p>
        <p style="margin:8px 0 0;color:#16a34a;font-size:22px;font-weight:bold;">${escapeHtmlAttr(uptimeStr)}</p>
      </td>
      <td width="4%" style="font-size:0;line-height:0;">&nbsp;</td>
      <td width="48%" valign="top" style="padding:14px;background-color:#f7fafc;border:1px solid #edf2f7;">
        <p style="margin:0;color:#718096;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Library size</p>
        <p style="margin:8px 0 0;color:#282A2D;font-size:15px;"><strong>${escapeHtmlAttr(String(stats.movies ?? 0))}</strong> movies</p>
        <p style="margin:4px 0 0;color:#282A2D;font-size:15px;"><strong>${escapeHtmlAttr(String(stats.shows ?? 0))}</strong> TV shows</p>
      </td>
    </tr>
  </table>
  ${recentHtml || '<p style="margin:0;color:#718096;">No recently added titles to show.</p>'}
  <p style="margin:20px 0 0;color:#718096;font-size:13px;">Manage or unsubscribe anytime in your <a href="${escapeHtmlAttr(publicDomain || '#')}" style="color:#e5a00d;text-decoration:none;">User Portal</a> preferences.</p>
`;
