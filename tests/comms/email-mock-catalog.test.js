import assert from 'node:assert/strict';
import test from 'node:test';

import { buildMockEmailCatalog, sendMockEmailCatalog } from '../../lib/comms/email-mock-catalog.js';

const EXPECTED_IDS = [
    'smtp_test',
    'request_approved',
    'request_declined',
    'request_available',
    'issue_reply',
    'issue_resolved',
    'expiry_warning',
    'access_expired',
    'access_updated',
    'invite',
    'newsletter',
    'newsletter_test',
    'broadcast',
    'announcement',
    'media_issue_report',
];

test('mock catalog covers every outbound email type', () => {
    const catalog = buildMockEmailCatalog({
        config: { serverIdentifier: 'LostWaldo', contactEmail: 'owner@example.com' },
        to: 'kalebrharrison@gmail.com',
    });
    assert.deepEqual(catalog.map((entry) => entry.id), EXPECTED_IDS);
    for (const entry of catalog) {
        assert.match(entry.subject, /^\[MOCK\] /);
        assert.ok(String(entry.html || '').trim(), `${entry.id} is missing html`);
    }
});

test('sendMockEmailCatalog delivers every template to the requested address', async () => {
    const sent = [];
    const result = await sendMockEmailCatalog({
        sendEmail: async (_config, to, subject, html, _transporter, options) => {
            sent.push({ to, subject, html, options });
            return true;
        },
        config: { serverIdentifier: 'LostWaldo' },
        to: 'kalebrharrison@gmail.com',
        delayMs: 0,
    });
    assert.equal(result.sent, EXPECTED_IDS.length);
    assert.equal(result.failed, 0);
    assert.equal(sent.length, EXPECTED_IDS.length);
    assert.ok(sent.every((row) => row.to === 'kalebrharrison@gmail.com'));
    assert.ok(sent.every((row) => row.options?.allowAnyRecipient === true));
});

test('sendMockEmailCatalog requires a recipient', async () => {
    await assert.rejects(
        () => sendMockEmailCatalog({ sendEmail: async () => true, delayMs: 0 }),
        /Test recipient is required/,
    );
});
