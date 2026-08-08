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
        config: {
            smtpFrom: 'Requests - LostWaldo <requests@lostwaldo.net>',
            publicDomain: 'https://plex-beta.lostwaldo.net',
            serverIdentifier: 'ABFAADCCEEA3EA4383616E4A3DCDEE88A1086E2F',
            contactEmail: 'owner@example.com',
        },
        to: 'kalebrharrison@gmail.com',
    });
    assert.deepEqual(catalog.map((entry) => entry.id), EXPECTED_IDS);
    for (const entry of catalog) {
        assert.match(entry.subject, /^\[MOCK\] /);
        assert.ok(String(entry.html || '').trim(), `${entry.id} is missing html`);
        assert.match(entry.html, /color-scheme" content="light"/, `${entry.id} is missing light chrome`);
        assert.match(entry.html, /#f4f6f9/, `${entry.id} is missing portal background`);
        assert.match(entry.html, /cid:logo/, `${entry.id} is missing constrained logo`);
        assert.match(entry.html, /max-height:36px/, `${entry.id} logo is not size-capped`);
        assert.match(entry.html, /LostWaldo/, `${entry.id} is missing friendly server name`);
        assert.doesNotMatch(entry.html, /font-size:13px[^>]*>\s*ABFAADCCEEA3/i, `${entry.id} used a Plex machine id as the heading`);
        assert.doesNotMatch(entry.html, /PLEX SERVER/, `${entry.id} still uses the old dark header`);
    }
    const available = catalog.find((entry) => entry.id === 'request_available');
    assert.match(available.html, /Open in Portal/);
    assert.match(available.html, /Watch on Plex/);
    assert.match(available.html, /\/discovery\/tv\/95396/);
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
