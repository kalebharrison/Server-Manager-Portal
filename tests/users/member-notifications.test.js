import assert from 'node:assert/strict';
import test from 'node:test';

import { createMemberNotifications } from '../../lib/users/member-notifications.js';

test('request approved always emails even when the user opted out', async () => {
    const notices = [];
    const dms = [];
    const notify = createMemberNotifications({
        usersPath: 'users.json',
        loadFile: async () => [{
            id: 'u1',
            username: 'sam',
            email: 'sam@example.com',
            discordId: '123456789012345678',
            notifyRequestUpdates: false,
        }],
        sendMemberNotice: async (_config, user, payload) => {
            notices.push({ userId: user.id, ...payload });
            return true;
        },
        escapeHtmlAttr: (value) => String(value || ''),
        discordNotifier: {
            notifyRequestUpdate: async (_config, payload) => {
                dms.push(payload);
                return true;
            },
        },
    });

    await notify.notifyRequestUpdate({
        publicDomain: 'https://plex-beta.lostwaldo.net',
        smtpFrom: 'Requests - LostWaldo <requests@lostwaldo.net>',
        mailjetInboundSecret: 'inbound-test-secret-0123456789abcdef0123456789abcdef',
    }, {
        requestedBy: { id: 'u1' },
        title: 'Dune',
        statusLabel: 'approved',
        requestId: 9,
        mediaType: 'movie',
        tmdbId: 438631,
        posterPath: '/d5NXSklXo0qyIYkgV94XAgMIckC.jpg',
    });

    assert.equal(notices.length, 1);
    assert.equal(notices[0].type, 'request_update');
    assert.match(notices[0].replyTo, /^replies\+r\.9\.[a-f0-9]{16}@reply\.lostwaldo\.net$/);
    assert.match(notices[0].subject, /\[LostWaldo\] Request Approved: Dune/);
    assert.match(notices[0].html, /Request Approved/);
    assert.match(notices[0].html, /\/discovery\/movie\/438631/);
    assert.match(notices[0].html, /Open in Portal/);
    assert.match(notices[0].html, /image\.tmdb\.org\/t\/p\/w342\/d5NXSklXo0qyIYkgV94XAgMIckC\.jpg/);
    assert.equal(dms.length, 1);
    assert.equal(dms[0].discordId, '123456789012345678');
});

test('issue reply always emails even when the user opted out', async () => {
    const notices = [];
    const dms = [];
    const notify = createMemberNotifications({
        usersPath: 'users.json',
        loadFile: async () => [{
            id: 'u1',
            username: 'sam',
            email: 'sam@example.com',
            discordId: '123456789012345678',
            notifyIssueReplies: false,
        }],
        sendMemberNotice: async (_config, user, payload) => {
            notices.push({ userId: user.id, ...payload });
            return true;
        },
        escapeHtmlAttr: (value) => String(value || ''),
        discordNotifier: {
            notifyIssueReply: async (_config, payload) => {
                dms.push(payload);
                return true;
            },
        },
    });

    await notify.notifyIssueReply({
        smtpFrom: 'Requests - LostWaldo <requests@lostwaldo.net>',
        mailjetInboundSecret: 'inbound-test-secret-0123456789abcdef0123456789abcdef',
    }, {
        issue: {
            id: 'portal:550e8400-e29b-41d4-a716-446655440000',
            title: 'Bad audio',
            reporterId: 'u1',
            updatedAt: '2026-01-01',
            posterPath: '/d5NXSklXo0qyIYkgV94XAgMIckC.jpg',
        },
        replyAuthor: 'Admin',
    });

    assert.equal(notices.length, 1);
    assert.equal(notices[0].type, 'issue_reply');
    assert.match(notices[0].replyTo, /^replies\+i\.p550e8400e29b41d4a716446655440000\.[a-f0-9]{16}@reply\.lostwaldo\.net$/);
    assert.equal(dms.length, 1);
    assert.equal(dms[0].discordId, '123456789012345678');
});
