import assert from 'node:assert/strict';
import test from 'node:test';

import { escapeHtmlAttr } from '../../lib/http/html-shell.js';
import {
    PORTAL_EMAIL_ACCENT_DANGER,
    buildAccessExpiredHtml,
    buildAnnouncementEmailHtml,
    buildExpiryWarningHtml,
    buildMediaIssueReportHtml,
    wrapBroadcastEmailHtml,
} from '../../lib/comms/email-templates.js';
import { buildInviteEmailHtml } from '../../lib/users/invite-email.js';

const user = { username: 'kaleb', displayName: 'Kaleb', expiryDate: '2026-08-15T00:00:00.000Z' };

test('expiry and invite mail share the light portal chrome', () => {
    const warning = buildExpiryWarningHtml({
        user,
        config: { serverIdentifier: 'LostWaldo', smtpUser: 'owner@example.com' },
        days: 7,
        escapeHtmlAttr,
    });
    const invite = buildInviteEmailHtml({
        serverName: 'LostWaldo',
        inviteUrl: 'https://example.com/invite/abc',
        durationDays: 30,
    });
    for (const html of [warning, invite]) {
        assert.match(html, /color-scheme" content="light"/);
        assert.doesNotMatch(html, /cid:logo/i);
        assert.doesNotMatch(html, /background-color: #282A2D/);
    }
});

test('expired access uses the danger accent on the same chrome', () => {
    const html = buildAccessExpiredHtml({
        user,
        config: { serverIdentifier: 'LostWaldo', contactEmail: 'owner@example.com' },
        escapeHtmlAttr,
    });
    assert.match(html, new RegExp(`bgcolor="${PORTAL_EMAIL_ACCENT_DANGER}"`));
    assert.match(html, /color-scheme" content="light"/);
});

test('broadcast, announcement, and playback reports use portal chrome', () => {
    const broadcast = wrapBroadcastEmailHtml({
        subject: 'Hello',
        bodyHtml: '<p>Hi</p>',
        serverName: 'LostWaldo',
    });
    const announcement = buildAnnouncementEmailHtml({
        text: 'Library down tonight',
        serverName: 'LostWaldo',
    });
    const report = buildMediaIssueReportHtml({
        username: 'Kaleb',
        title: 'Dune',
        key: '1',
        issue: 'Bad audio',
    });
    for (const html of [broadcast, announcement, report]) {
        assert.match(html, /color-scheme" content="light"/);
        assert.match(html, /#f4f6f9/);
    }
});
