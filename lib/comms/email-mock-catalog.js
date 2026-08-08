import fs from 'fs/promises';
import path from 'path';

import { getDaysUntilExpiry } from '../core/date-utils.js';
import { escapeHtmlAttr } from '../http/html-shell.js';
import { sanitizeBroadcastHtml } from './broadcast-html.js';
import { htmlForPreview, resolvePreviewLogoHref } from './email-logo.js';
import {
    buildPortalIssuesUrl,
    buildPortalMediaUrl,
    buildPortalPreferencesUrl,
    buildPortalRequestsUrl,
    emailNoticeSubject,
    emailSubject,
    resolveEmailServerName,
} from './email-identity.js';
import {
    buildAccessAdjustmentHtml,
    buildAccessExpiredHtml,
    buildAnnouncementEmailHtml,
    buildExpiryWarningHtml,
    buildMediaIssueReportHtml,
    buildMemberNoticeHtml,
    buildSmtpTestHtml,
    wrapBroadcastEmailHtml,
} from './email-templates.js';
import { buildNewsletterBodyContent, buildNewsletterHtmlDocument } from './newsletter-html-layout.js';
import { buildInviteEmailHtml, buildInviteEmailSubject } from '../users/invite-email.js';
import { buildPlexWatchUrl } from '../media/library-deep-link.js';

const MOCK_PREFIX = '[MOCK] ';
const DUNE_POSTER = 'https://image.tmdb.org/t/p/w342/d5NXSklXo0qyIYkgV94XAgMIckC.jpg';
const SEVERANCE_POSTER = 'https://image.tmdb.org/t/p/w342/lFf6LLrQjYqM7WI4BNhut3vhvZR.jpg';
const ROOM_POSTER = 'https://image.tmdb.org/t/p/w342/ddXyxoLvN72WsQdFnZ4N3z6SGCh.jpg';

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

const notice = ({ config, title, greeting, body, footer, links, posterUrl, posterHref }) => buildMemberNoticeHtml({
    config,
    title,
    greeting,
    footer,
    links,
    posterUrl,
    posterHref,
    bodyHtml: body,
});

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
            recentHtml: `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 12px;">
                <tr>
                  <td width="72" valign="top" style="padding:0 12px 12px 0;"><img src="${DUNE_POSTER}" alt="" width="60" height="90" style="display:block;width:60px;height:90px;object-fit:cover;border-radius:4px;border:0;" /></td>
                  <td valign="middle"><a href="${dunePortal}" style="color:#e5a00d;font-weight:600;text-decoration:underline;">Dune (2021)</a> · <a href="${plexDune}" style="color:#e5a00d;font-weight:600;text-decoration:underline;">Plex</a></td>
                </tr>
                <tr>
                  <td width="72" valign="top" style="padding:0 12px 0 0;"><img src="${SEVERANCE_POSTER}" alt="" width="60" height="90" style="display:block;width:60px;height:90px;object-fit:cover;border-radius:4px;border:0;" /></td>
                  <td valign="middle"><a href="${severancePortal}" style="color:#e5a00d;font-weight:600;text-decoration:underline;">Severance</a> · <a href="${plexSeverance}" style="color:#e5a00d;font-weight:600;text-decoration:underline;">Plex</a></td>
                </tr>
              </table>`,
            uptimeStr: '99.90%',
            stats: { movies: 1842, shows: 412 },
        }),
    }).replace(/{{USERNAME}}/g, greeting).replace(/{{SERVER_NAME}}/g, escapeHtmlAttr(serverName));

    return [
        {
            id: 'smtp_test',
            subject: `${MOCK_PREFIX}${emailSubject(config, 'Test Email')}`,
            html: buildSmtpTestHtml(config),
        },
        {
            id: 'request_approved',
            subject: `${MOCK_PREFIX}${emailNoticeSubject(config, 'Request Approved', 'Dune')}`,
            html: notice({
                config,
                title: 'Request Approved',
                greeting,
                footer: 'Request approved and available notices are always sent.',
                posterUrl: DUNE_POSTER,
                posterHref: dunePortal,
                body: '<p style="margin:0;">Your request for <strong>Dune</strong> is now <strong>Approved</strong>.</p>',
                links: [
                    { label: 'Open in Portal', url: dunePortal },
                    { label: 'My Requests', url: requestsUrl },
                ],
            }),
        },
        {
            id: 'request_declined',
            subject: `${MOCK_PREFIX}${emailNoticeSubject(config, 'Request Declined', 'The Room')}`,
            html: notice({
                config,
                title: 'Request Declined',
                greeting,
                footer: 'Request approved and available notices are always sent.',
                posterUrl: ROOM_POSTER,
                posterHref: 'https://example.com/discovery/movie/311',
                body: '<p style="margin:0;">Your request for <strong>The Room</strong> is now <strong>Declined</strong>.</p>',
                links: [
                    { label: 'Open in Portal', url: 'https://example.com/discovery/movie/311' },
                    { label: 'My Requests', url: requestsUrl },
                ],
            }),
        },
        {
            id: 'request_available',
            subject: `${MOCK_PREFIX}${emailNoticeSubject(config, 'Now Available', 'Severance')}`,
            html: notice({
                config,
                title: 'Now Available',
                greeting,
                footer: 'Request approved and available notices are always sent.',
                posterUrl: SEVERANCE_POSTER,
                posterHref: severancePortal,
                body: '<p style="margin:0;"><strong>Severance</strong> is now available to watch.</p>',
                links: [
                    { label: 'Open in Portal', url: severancePortal },
                    { label: 'Watch on Plex', url: plexSeverance },
                ],
            }),
        },
        {
            id: 'issue_reply',
            subject: `${MOCK_PREFIX}${emailSubject(config, 'New Reply on Your Issue')}`,
            html: notice({
                config,
                title: 'Issue Reply',
                greeting,
                footer: 'Issue updates are always sent.',
                posterUrl: DUNE_POSTER,
                posterHref: dunePortal,
                body: '<p style="margin:0 0 12px;">There\'s a new reply on your issue for <strong>Bad audio on Dune</strong>.</p><p style="margin:0;">Open My Issues in Server Portal to read it.</p>',
                links: [
                    { label: 'Open in Portal', url: dunePortal },
                    { label: 'My Issues', url: issuesUrl },
                    { label: 'Watch on Plex', url: plexDune },
                ],
            }),
        },
        {
            id: 'issue_resolved',
            subject: `${MOCK_PREFIX}${emailNoticeSubject(config, 'Issue Resolved', 'Bad audio on Dune')}`,
            html: notice({
                config,
                title: 'Issue Resolved',
                greeting,
                footer: 'Issue updates are always sent.',
                posterUrl: DUNE_POSTER,
                posterHref: dunePortal,
                body: '<p style="margin:0;">Your issue for <strong>Bad audio on Dune</strong> was marked <strong>Resolved</strong>.</p>',
                links: [
                    { label: 'Open in Portal', url: dunePortal },
                    { label: 'My Issues', url: issuesUrl },
                    { label: 'Watch on Plex', url: plexDune },
                ],
            }),
        },
        {
            id: 'expiry_warning',
            subject: `${MOCK_PREFIX}${emailSubject(config, 'Your Shared Access Expires in 7 Days')}`,
            html: buildExpiryWarningHtml({
                user,
                config,
                days: 7,
                escapeHtmlAttr,
            }),
        },
        {
            id: 'access_expired',
            subject: `${MOCK_PREFIX}${emailSubject(config, 'Your Shared Access Has Expired')}`,
            html: buildAccessExpiredHtml({
                user,
                config: { ...config, contactEmail: config.contactEmail || to },
                escapeHtmlAttr,
            }),
        },
        {
            id: 'access_updated',
            subject: `${MOCK_PREFIX}${emailSubject(config, 'Your Access Has Been Updated')}`,
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
            subject: `${MOCK_PREFIX}${emailSubject(config, 'Newsletter Test')}`,
            html: newsletterHtml,
        },
        {
            id: 'broadcast',
            subject: `${MOCK_PREFIX}${emailSubject(config, 'Server Broadcast')}`,
            html: wrapBroadcastEmailHtml({
                subject: 'Server Broadcast',
                config,
                bodyHtml: sanitizeBroadcastHtml(
                    '<p>This is a sample broadcast to members.</p><p>New 4K remuxes landed this week — check Discover.</p>',
                ),
            }),
        },
        {
            id: 'announcement',
            subject: `${MOCK_PREFIX}${emailSubject(config, 'Server Announcement')}`,
            html: buildAnnouncementEmailHtml({
                config,
                text: 'Library maintenance tonight from 1–3 AM. Streams may drop once.',
            }),
        },
        {
            id: 'media_issue_report',
            subject: `${MOCK_PREFIX}${emailNoticeSubject(config, 'Playback Issue', 'Dune')}`,
            html: buildMediaIssueReportHtml({
                username: greeting,
                title: 'Dune',
                key: '12345',
                issue: 'Audio drops out at 01:12:40 on the 4K copy.',
                config,
                posterUrl: DUNE_POSTER,
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

export const buildEmailPreviewIndexHtml = (catalog = [], {
    logoHref = 'logo.png',
    hrefForId = (id) => `${id}.html`,
} = {}) => {
    const links = catalog.map((entry) => (
        `<a href="${escapeHtmlAttr(hrefForId(entry.id))}" target="preview">${escapeHtmlAttr(entry.id)}</a>`
    )).join('');
    const first = catalog[0]?.id ? hrefForId(catalog[0].id) : '';
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Email previews</title>
  <style>
    body { margin:0; font-family:Arial,Helvetica,sans-serif; background:#111; color:#eee; }
    .layout { display:flex; min-height:100vh; }
    nav { width:280px; padding:20px 16px; background:#1a1a1a; overflow:auto; box-sizing:border-box; }
    nav h1 { margin:0 0 8px; font-size:16px; }
    nav p { margin:0 0 16px; color:#9ca3af; font-size:12px; }
    nav a { display:block; color:#e5a00d; padding:7px 0; text-decoration:none; font-size:13px; }
    nav a:hover { text-decoration:underline; }
    iframe { flex:1; border:0; background:#fff; }
  </style>
</head>
<body>
  <div class="layout">
    <nav>
      <h1>Email previews</h1>
      <p>HTML mockups. Logo: ${escapeHtmlAttr(logoHref)}</p>
      ${links}
    </nav>
    <iframe name="preview" src="${escapeHtmlAttr(first)}" title="Email preview"></iframe>
  </div>
</body>
</html>`;
};

export const writeMockEmailPreviews = async ({
    config = {},
    outDir,
    logoHref,
} = {}) => {
    const dest = String(outDir || '').trim();
    if (!dest) {
        const error = new Error('Preview output directory is required.');
        error.statusCode = 400;
        throw error;
    }
    await fs.mkdir(dest, { recursive: true });
    const catalog = buildMockEmailCatalog({ config, to: 'preview@example.com' });
    const href = logoHref || resolvePreviewLogoHref(config);
    for (const entry of catalog) {
        await fs.writeFile(path.join(dest, `${entry.id}.html`), htmlForPreview(entry.html, href), 'utf8');
    }
    await fs.writeFile(path.join(dest, 'index.html'), buildEmailPreviewIndexHtml(catalog, { logoHref: href }), 'utf8');
    return {
        outDir: dest,
        count: catalog.length,
        logoHref: href,
        files: ['index.html', ...catalog.map((entry) => `${entry.id}.html`)],
    };
};
