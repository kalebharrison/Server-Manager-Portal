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

    await notify.notifyRequestUpdate({}, {
        requestedBy: { id: 'u1' },
        title: 'Dune',
        statusLabel: 'approved',
        requestId: 9,
    });

    assert.equal(notices.length, 1);
    assert.equal(notices[0].type, 'request_update');
    assert.match(notices[0].subject, /approved/);
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

    await notify.notifyIssueReply({}, {
        issue: { id: 'iss-1', title: 'Bad audio', reporterId: 'u1', updatedAt: '2026-01-01' },
        replyAuthor: 'Admin',
    });

    assert.equal(notices.length, 1);
    assert.equal(notices[0].type, 'issue_reply');
    assert.equal(dms.length, 1);
    assert.equal(dms[0].discordId, '123456789012345678');
});
