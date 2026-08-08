import { EMAIL_PRODUCT_NAME, resolveEmailServerName } from '../comms/email-identity.js';
import { buildEmailButton, buildPortalEmailHtml } from '../comms/email-templates.js';
import { escapeHtmlAttr } from '../http/html-shell.js';

export const buildInviteEmailSubject = (serverName) => `You've been invited to ${String(serverName || 'the server')}!`;

export const buildInviteEmailHtml = ({ serverName, inviteUrl, durationDays, config } = {}) => {
    const safeServerName = escapeHtmlAttr(serverName || resolveEmailServerName(config));
    const safeInviteUrl = escapeHtmlAttr(inviteUrl || '#');
    const safeDurationDays = escapeHtmlAttr(String(durationDays ?? ''));

    return buildPortalEmailHtml({
        heading: safeServerName,
        title: 'You are invited',
        footer: `${safeServerName} · ${EMAIL_PRODUCT_NAME}`,
        bodyHtml: `
          <p style="margin:0 0 12px;">You have been invited to join <strong>${safeServerName}</strong>.</p>
          <p style="margin:0;">This invite is single use and grants access for <strong>${safeDurationDays} days</strong>.</p>
          ${buildEmailButton(safeInviteUrl, 'Claim your access')}
        `,
    });
};
