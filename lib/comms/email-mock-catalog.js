import { getDaysUntilExpiry } from '../core/date-utils.js';
import { escapeHtmlAttr } from '../http/html-shell.js';
import { sanitizeBroadcastHtml } from './broadcast-html.js';
import {
    buildPortalIssuesUrl,
    buildPortalMediaUrl,
    buildPortalPreferencesUrl,
    buildPortalRequestsUrl,
    emailSubject,
    resolveEmailServerName,
} from './email-identity.js';
import {
    buildAccessAdjustmentHtml,
    buildAccessExpiredHtml,
    buildAnnouncementEmailHtml,
    buildEmailLinkRow,
    buildExpiryWarningHtml,
    buildMediaIssueReportHtml,
    buildPortalEmailHtml,
    buildSmtpTestHtml,
    wrapBroadcastEmailHtml,
} from './email-templates.js';
import { buildNewsletterBodyContent, buildNewsletterHtmlDocument } from './newsletter-html-layout.js';
import { buildInviteEmailHtml, buildInviteEmailSubject } from '../users/invite-email.js';
import { buildPlexWatchUrl } from '../media/library-deep-link.js';

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

const notice = ({ config, title, greeting, body, footer, links }) => {
    const serverName = resolveEmailServerName(config);
    return buildPortalEmailHtml({
        title,
        heading: serverName,
        footer,
        bodyHtml: `<p style="margin:0 0 12px;">Hello <strong>${greeting}</strong>,</p>${body}${buildEmailLinkRow(links)}`,
    });
};

export const buildMockEmailCatalog = ({ config = {}, to = 'member@example.com' } = {}) => {
    const user = sampleUser(to);
    const greeting = escapeHtmlAttr(user.displayName);
    const serverName = resolveEmailServerName(config);
    const dunePortal = buildPortalMediaUrl(config, { mediaType: 'movie', tmdbId: 438631 })
        || 'https://example.com/discovery/movie/438631';
    const severancePortal = buildPortalMediaUrl(config, { mediaType: 'tv', tmdbId: 95396 })
        || 'https://example.com/discovery/tv/95396';
    const plexDune = buildPlexWatchUrl(config.serverIdentifier || 'mock-server', '12345')
        || 'https://app.plex.tv/desktop/#!/server/mock-server/details?key=%2Flibrary%2Fmetadata%2F12345';
    const plexSeverance = buildPlexWatchUrl(config.serverIdentifier || 'mock-server', '67890')
        || 'https://app.plex.tv/desktop/#!/server/mock-server/details?key=%2Flibrary%2Fmetadata%2F67890';
    const requestsUrl = buildPortalRequestsUrl(config) || 'https://example.com/discovery/requests';
    const issuesUrl = buildPortalIssuesUrl(config) || 'https://example.com/discovery/issues';
    const prefsUrl = buildPortalPreferencesUrl(config) || 'https://example.com/preferences';

    const newsletterHtml = buildNewsletterHtmlDocument({
        serverName,
        config,
        htmlContent: buildNewsletterBodyContent({
            config,
            publicDomain: config.publicDomain,
            recentHtml: `<p style="margin:0 0 8px;"><a href="${dunePortal}" style="color:#e5a00d;font-weight:600;text-decoration:underline;">Dune (2021)</a> · <a href="${plexDune}" style="color:#e5a00d;font-weight:600;text-decoration:underline;">Plex</a></p>
              <p style="margin:0;"><a href="${severancePortal}" style="color:#e5a00d;font-weight:600;text-decoration:underline;">Severance</a> · <a href="${plexSeverance}" style="color:#e5a00d;font-weight:600;text-decoration:underline;">Plex</a></p>`,
            uptimeStr: '99.90%',
            stats: { movies: 1842, shows: 412 },
        }),
    }).replace(/{{USERNAME}}/g, greeting).replace(/{{SERVER_NAME}}/g, escapeHtmlAttr(serverName));

    return [
        {
            id: 'smtp_test',
            subject: `${MOCK_PREFIX}${emailSubject(config, 'Test email')}`,
            html: buildSmtpTestHtml(config),
        },
        {
            id: 'request_approved',
            subject: `${MOCK_PREFIX}${emailSubject(config, 'Request approved: Dune')}`,
            html: notice({
                config,
                title: 'Request approved',
                greeting,
                footer: 'Request approved and available notices are always sent.',
                body: '<p style="margin:0;">Your request for <strong>Dune</strong> is now <strong>approved</strong>.</p>',
                links: [
                    { label: 'Open in Portal', url: dunePortal },
                    { label: 'My requests', url: requestsUrl },
                ],
            }),
        },
        {
            id: 'request_declined',
            subject: `${MOCK_PREFIX}${emailSubject(config, 'Request declined: The Room')}`,
            html: notice({
                config,
                title: 'Request declined',
                greeting,
                footer: 'Request approved and available notices are always sent.',
                body: '<p style="margin:0;">Your request for <strong>The Room</strong> is now <strong>declined</strong>.</p>',
                links: [
                    { label: 'Open in Portal', url: 'https://example.com/discovery/movie/311' },
                    { label: 'My requests', url: requestsUrl },
                ],
            }),
        },
        {
            id: 'request_available',
            subject: `${MOCK_PREFIX}${emailSubject(config, 'Now available: Severance')}`,
            html: notice({
                config,
                title: 'Now available',
                greeting,
                footer: 'Request approved and available notices are always sent.',
                body: '<p style="margin:0;"><strong>Severance</strong> is now available to watch.</p>',
                links: [
                    { label: 'Open in Portal', url: severancePortal },
                    { label: 'Watch on Plex', url: plexSeverance },
                ],
            }),
        },
        {
            id: 'issue_reply',
            subject: `${MOCK_PREFIX}${emailSubject(config, 'New reply on your issue')}`,
            html: notice({
                config,
                title: 'Issue reply',
                greeting,
                footer: 'Issue updates are always sent.',
                body: '<p style="margin:0 0 12px;">There\'s a new reply on your issue for <strong>Bad audio on Dune</strong>.</p><p style="margin:0;">Open My issues in Server Portal to read it.</p>',
                links: [
                    { label: 'Open in Portal', url: dunePortal },
                    { label: 'My issues', url: issuesUrl },
                    { label: 'Watch on Plex', url: plexDune },
                ],
            }),
        },
        {
            id: 'issue_resolved',
            subject: `${MOCK_PREFIX}${emailSubject(config, 'Issue resolved: Bad audio on Dune')}`,
            html: notice({
                config,
                title: 'Issue resolved',
                greeting,
                footer: 'Issue updates are always sent.',
                body: '<p style="margin:0;">Your issue for <strong>Bad audio on Dune</strong> was marked <strong>resolved</strong>.</p>',
                links: [
                    { label: 'Open in Portal', url: dunePortal },
                    { label: 'My issues', url: issuesUrl },
                    { label: 'Watch on Plex', url: plexDune },
                ],
            }),
        },
        {
            id: 'expiry_warning',
            subject: `${MOCK_PREFIX}${emailSubject(config, 'Your shared access expires in 7 days')}`,
            html: buildExpiryWarningHtml({
                user,
                config,
                days: 7,
                escapeHtmlAttr,
            }),
        },
        {
            id: 'access_expired',
            subject: `${MOCK_PREFIX}${emailSubject(config, 'Your shared access has expired')}`,
            html: buildAccessExpiredHtml({
                user,
                config: { ...config, contactEmail: config.contactEmail || to },
                escapeHtmlAttr,
            }),
        },
        {
            id: 'access_updated',
            subject: `${MOCK_PREFIX}${emailSubject(config, 'Your access has been updated')}`,
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
                config,
                inviteUrl: `${String(config.publicDomain || 'https://example.com').replace(/\/$/, '')}/invite/mock-code`,
                durationDays: 30,
            }),
        },
        {
            id: 'newsletter',
            subject: `${MOCK_PREFIX}${emailSubject(config, 'Newsletter')}`,
            html: newsletterHtml,
        },
        {
            id: 'newsletter_test',
            subject: `${MOCK_PREFIX}${emailSubject(config, 'Newsletter test')}`,
            html: newsletterHtml,
        },
        {
            id: 'broadcast',
            subject: `${MOCK_PREFIX}${emailSubject(config, 'Server broadcast')}`,
            html: wrapBroadcastEmailHtml({
                subject: 'Server broadcast',
                config,
                bodyHtml: sanitizeBroadcastHtml(
                    '<p>This is a sample broadcast to members.</p><p>New 4K remuxes landed this week — check Discover.</p>',
                ),
            }),
        },
        {
            id: 'announcement',
            subject: `${MOCK_PREFIX}${emailSubject(config, 'Server announcement')}`,
            html: buildAnnouncementEmailHtml({
                config,
                text: 'Library maintenance tonight from 1–3 AM. Streams may drop once.',
            }),
        },
        {
            id: 'media_issue_report',
            subject: `${MOCK_PREFIX}${emailSubject(config, 'Playback issue: Dune')}`,
            html: buildMediaIssueReportHtml({
                username: greeting,
                title: 'Dune',
                key: '12345',
                issue: 'Audio drops out at 01:12:40 on the 4K copy.',
                config,
                links: [
                    { label: 'Open in Portal', url: dunePortal },
                    { label: 'Watch on Plex', url: plexDune },
                    prefsUrl ? { label: 'Server Portal', url: prefsUrl } : null,
                ].filter(Boolean),
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
