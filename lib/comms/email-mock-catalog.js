import { getDaysUntilExpiry } from '../core/date-utils.js';
import { escapeHtmlAttr } from '../http/html-shell.js';
import { sanitizeBroadcastHtml } from './broadcast-html.js';
import {
    buildAccessAdjustmentHtml,
    buildAccessExpiredHtml,
    buildAnnouncementEmailHtml,
    buildExpiryWarningHtml,
    buildMediaIssueReportHtml,
    buildPortalEmailHtml,
    buildSmtpTestHtml,
    wrapBroadcastEmailHtml,
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

const notice = ({ title, greeting, body, footer, heading }) => buildPortalEmailHtml({
    title,
    heading,
    footer,
    bodyHtml: `<p style="margin:0 0 12px;">Hello <strong>${greeting}</strong>,</p>${body}`,
});

export const buildMockEmailCatalog = ({ config = {}, to = 'member@example.com' } = {}) => {
    const user = sampleUser(to);
    const greeting = escapeHtmlAttr(user.displayName);
    const serverName = config.serverIdentifier || 'LostWaldo';
    const safeServer = escapeHtmlAttr(serverName);

    const newsletterHtml = buildNewsletterHtmlDocument({
        serverName,
        htmlContent: buildNewsletterBodyContent({
            recentHtml: '<p style="margin:0;">Sample recently added: Dune (2021), Severance S01E01.</p>',
            uptimeStr: '99.90%',
            stats: { movies: 1842, shows: 412 },
            publicDomain: config.publicDomain || 'https://example.com',
        }),
    }).replace(/{{USERNAME}}/g, greeting).replace(/{{SERVER_NAME}}/g, safeServer);

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
                heading: safeServer,
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
                heading: safeServer,
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
                heading: safeServer,
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
                heading: safeServer,
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
                heading: safeServer,
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
                escapeHtmlAttr,
            }),
        },
        {
            id: 'access_expired',
            subject: `${MOCK_PREFIX}[Plex Server] Your shared access has expired`,
            html: buildAccessExpiredHtml({
                user,
                config: { ...config, contactEmail: config.contactEmail || to },
                escapeHtmlAttr,
            }),
        },
        {
            id: 'access_updated',
            subject: `${MOCK_PREFIX}[Plex Server] Your access has been updated`,
            html: buildAccessAdjustmentHtml({
                user,
                config,
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
            html: wrapBroadcastEmailHtml({
                subject: 'Server broadcast',
                serverName,
                bodyHtml: sanitizeBroadcastHtml(
                    '<p>This is a sample broadcast to members.</p><p>New 4K remuxes landed this week — check Discover.</p>',
                ),
            }),
        },
        {
            id: 'announcement',
            subject: `${MOCK_PREFIX}Server Announcement - ${serverName}`,
            html: buildAnnouncementEmailHtml({
                serverName: safeServer,
                text: 'Library maintenance tonight from 1–3 AM. Streams may drop once.',
            }),
        },
        {
            id: 'media_issue_report',
            subject: `${MOCK_PREFIX}Plex Issue Report: Dune`,
            html: buildMediaIssueReportHtml({
                username: greeting,
                title: 'Dune',
                key: '12345',
                issue: 'Audio drops out at 01:12:40 on the 4K copy.',
            }),
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
