import assert from 'node:assert/strict';
import test from 'node:test';

import {
    extractEmailAddress,
    listDeliverableMembers,
    resolveOwnerContactHref,
    resolveOwnerInbox,
} from '../../lib/comms/email-recipients.js';

test('owner inbox prefers contact email over SMTP login and From label', () => {
    const users = [{ id: 'a1', email: 'admin@example.com', isPortalAdmin: true }];
    assert.equal(extractEmailAddress('Requests - LostWaldo <requests@lostwaldo.net>'), 'requests@lostwaldo.net');
    assert.equal(resolveOwnerInbox({
        contactEmail: 'owner@lostwaldo.net',
        smtpUser: '8a1b2c3d',
        smtpFrom: 'Requests - LostWaldo <requests@lostwaldo.net>',
    }, users), 'owner@lostwaldo.net');
    assert.equal(resolveOwnerInbox({
        smtpUser: '8a1b2c3d',
        smtpFrom: 'Requests - LostWaldo <requests@lostwaldo.net>',
    }, users), 'admin@example.com');
    assert.equal(resolveOwnerInbox({
        smtpUser: '8a1b2c3d',
        smtpFrom: 'Requests - LostWaldo <requests@lostwaldo.net>',
    }, []), 'requests@lostwaldo.net');
    assert.equal(resolveOwnerInbox({ smtpUser: '8a1b2c3d' }, []), '');
});

test('owner contact href uses contactUrl then owner inbox', () => {
    assert.equal(
        resolveOwnerContactHref({ contactUrl: 'https://lostwaldo.net/help', contactEmail: 'owner@lostwaldo.net' }),
        'https://lostwaldo.net/help',
    );
    assert.equal(
        resolveOwnerContactHref({ contactEmail: 'owner@lostwaldo.net' }),
        'mailto:owner@lostwaldo.net',
    );
    assert.equal(resolveOwnerContactHref({ smtpUser: '8a1b2c3d' }), '');
});

test('member delivery lists prefer contactEmail override', () => {
    const rows = listDeliverableMembers([
        { id: '1', email: 'a@example.com', contactEmail: 'alt@example.com' },
        { id: '2', username: 'none' },
        { id: '3', email: 'b@example.com', plexAccessStatus: 'active' },
    ], (user) => user.plexAccessStatus === 'active' || user.id === '1');
    assert.deepEqual(rows.map((row) => row.email), ['alt@example.com', 'b@example.com']);
});
