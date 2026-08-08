import { getDaysUntilExpiry } from '../core/date-utils.js';
import { escapeHtmlAttr } from '../http/html-shell.js';
import { sanitizeBroadcastHtml } from './broadcast-html.js';
import {
    buildAccessAdjustmentHtml,
    buildAccessExpiredHtml,
    buildExpiryWarningHtml,
    buildPortalEmailHtml,
    buildSmtpTestHtml,
} from './email-templates.js';
import { buildNewsletterBodyContent, buildNewsletterHtmlDocument } from './newsletter-html-layout.js';
import { buildInviteEmailHtml, buildInviteEmailSubject } from '../users/invite-email.js';

const MOCK_PREFIX = '[MOCK] ';

const sampleUser = (email) => {
    const expiry = new Date();
    expiry.setDate(expiry.getDate() + 7);
    return {
        username: 'kaleb',
        displayName: 'Kaleb',
        email,
        expiryDate: expiry.toISOString(),
    };
};

const notice = ({ title, greeting, body, footer }) => buildPortalEmailHtml({
    title,
    footer,
    bodyHtml: `<p style="margin:0 0 12px;">Hello <strong>${greeting}</strong>,</p>${body}`,
});

export const buildMockEmailCatalog = ({ config = {}, to = 'member@example.com' } = {}) => {
    const user = sampleUser(to);
    const greeting = escapeHtmlAttr(user.displayName);
    const serverName = config.serverIdentifier || 'LostWaldo';
    const safeServer = escapeHtmlAttr(serverName);

    const announcementHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #1a1b26; color: #a9b1d6; padding: 20px; border-radius: 10px;">
            <h2 style="color: #E5A00D; text-align: center; text-transform: uppercase; letter-spacing: 2px;">Server Announcement</h2>
            <div style="background-color: #24283b; padding: 20px; border-radius: 8px; margin-top: 20px; border-left: 4px solid #E5A00D;">
                <p style="white-space: pre-wrap; font-size: 16px; line-height: 1.6; color: #c0caf5; margin: 0;">Library maintenance tonight from 1–3 AM. Streams may drop once.</p>
            </div>
            <p style="text-align: center; margin-top: 30px; font-size: 12px; color: #565f89;">
                You are receiving this message because you are an active user on ${safeServer}.
            </p>
        </div>
    `;

    const newsletterHtml = buildNewsletterHtmlDocument({
        serverName,
        htmlContent: buildNewsletterBodyContent({
            recentHtml: '<p style="margin:0;color:#e5e7eb;">Sample recently added: Dune (2021), Severance S01E01.</p>',
            uptimeStr: '99.90%',
            stats: { movies: 1842, shows: 412 },
            publicDomain: config.publicDomain || 'https://plex-beta.lostwaldo.net',
        }),
    }).replace(/{{USERNAME}}/g, greeting).replace(/{{SERVER_NAME}}/g, safeServer);

    const broadcastBody = sanitizeBroadcastHtml(
        '<p>This is a sample broadcast to members.</p><p>New 4K remuxes landed this week — check Discover.</p>',
    );

    return [
        {
            id: 'smtp_test',
            subject: `${MOCK_PREFIX}[Server Portal] Test email`,
            html: buildSmtpTestHtml(),
        },
        {
            id: 'request_approved',
            subject: `${MOCK_PREFIX}[Server Portal] Request approved: Dune`,
            html: notice({
                title: 'Request update',
                greeting,
                footer: 'Request approved and available notices are always sent.',
                body: '<p style="margin:0;">Your request for <strong>Dune</strong> is now <strong>approved</strong>.</p>',
            }),
        },
        {
            id: 'request_declined',
            subject: `${MOCK_PREFIX}[Server Portal] Request declined: The Room`,
            html: notice({
                title: 'Request update',
                greeting,
                footer: 'Request approved and available notices are always sent.',
                body: '<p style="margin:0;">Your request for <strong>The Room</strong> is now <strong>declined</strong>.</p>',
            }),
        },
        {
            id: 'request_available',
            subject: `${MOCK_PREFIX}[Server Portal] Now available: Severance`,
            html: notice({
                title: 'Now available',
                greeting,
                footer: 'Request approved and available notices are always sent.',
                body: '<p style="margin:0;"><strong>Severance</strong> is now available on the server.</p>',
            }),
        },
        {
            id: 'issue_reply',
            subject: `${MOCK_PREFIX}[Server Portal] New reply on your issue`,
            html: notice({
                title: 'Issue reply',
                greeting,
                footer: 'Issue updates are always sent.',
                body: '<p style="margin:0 0 12px;">There\'s a new reply on your issue for <strong>Bad audio on Dune</strong>.</p><p style="margin:0;">Open the Issues tab in your User Portal to read it.</p>',
            }),
        },
        {
            id: 'issue_resolved',
            subject: `${MOCK_PREFIX}[Server Portal] Issue resolved: Bad audio on Dune`,
            html: notice({
                title: 'Issue resolved',
                greeting,
                footer: 'Issue updates are always sent.',
                body: '<p style="margin:0;">Your issue for <strong>Bad audio on Dune</strong> was marked <strong>resolved</strong>.</p>',
            }),
        },
        {
            id: 'expiry_warning',
            subject: `${MOCK_PREFIX}[Plex Server] Your shared access expires in 7 days`,
            html: buildExpiryWarningHtml({
                user,
                config,
                days: 7,
                hasLogo: false,
                escapeHtmlAttr,
            }),
        },
        {
            id: 'access_expired',
            subject: `${MOCK_PREFIX}[Plex Server] Your shared access has expired`,
            html: buildAccessExpiredHtml({
                user,
                config: { ...config, contactEmail: config.contactEmail || to },
                hasLogo: false,
                escapeHtmlAttr,
            }),
        },
        {
            id: 'access_updated',
            subject: `${MOCK_PREFIX}[Plex Server] Your access has been updated`,
            html: buildAccessAdjustmentHtml({
                user,
                hasLogo: false,
                escapeHtmlAttr,
                getDaysUntilExpiry,
            }),
        },
        {
            id: 'invite',
            subject: `${MOCK_PREFIX}${buildInviteEmailSubject(serverName)}`,
            html: buildInviteEmailHtml({
                serverName,
                inviteUrl: `${String(config.publicDomain || 'https://example.com').replace(/\/$/, '')}/invite/mock-code`,
                durationDays: 30,
                hasLogo: false,
            }),
        },
        {
            id: 'newsletter',
            subject: `${MOCK_PREFIX}Plex Server Automated Newsletter`,
            html: newsletterHtml,
        },
        {
            id: 'newsletter_test',
            subject: `${MOCK_PREFIX}Plex Server Automated Newsletter (Test)`,
            html: newsletterHtml,
        },
        {
            id: 'broadcast',
            subject: `${MOCK_PREFIX}Server broadcast`,
            html: broadcastBody,
        },
        {
            id: 'announcement',
            subject: `${MOCK_PREFIX}Server Announcement - ${serverName}`,
            html: announcementHtml,
        },
        {
            id: 'media_issue_report',
            subject: `${MOCK_PREFIX}Plex Issue Report: Dune`,
            html: `
                <h2>Issue Reported by ${greeting}</h2>
                <p><strong>Media:</strong> Dune</p>
                <p><strong>Key:</strong> 12345</p>
                <p><strong>User's Note:</strong></p>
                <blockquote style="background: #f9f9f9; padding: 10px; border-left: 5px solid #E5A00D;">
                    Audio drops out at 01:12:40 on the 4K copy.
                </blockquote>
            `,
        },
    ];
};

export const sendMockEmailCatalog = async ({
    sendEmail,
    config,
    to,
    delayMs = 1200,
    log = () => {},
} = {}) => {
    const recipient = String(to || '').trim();
    if (!recipient) {
        const error = new Error('Test recipient is required.');
        error.statusCode = 400;
        throw error;
    }
    const catalog = buildMockEmailCatalog({ config, to: recipient });
    const results = [];
    for (const [index, entry] of catalog.entries()) {
        try {
            await sendEmail(config, recipient, entry.subject, entry.html, null, { allowAnyRecipient: true });
            results.push({ id: entry.id, subject: entry.subject, ok: true });
            log(`Mock email sent: ${entry.id}`);
        } catch (error) {
            results.push({ id: entry.id, subject: entry.subject, ok: false, error: error.message });
            log(`Mock email failed: ${entry.id}: ${error.message}`);
        }
        if (index < catalog.length - 1 && delayMs > 0) {
            await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
    }
    return {
        to: recipient,
        sent: results.filter((row) => row.ok).length,
        failed: results.filter((row) => !row.ok).length,
        results,
    };
};
