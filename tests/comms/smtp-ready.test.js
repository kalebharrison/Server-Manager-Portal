import assert from 'node:assert/strict';
import test from 'node:test';

import { createEmailSendHelpers } from '../../lib/comms/email-send.js';
import { isSmtpConfigured, isSmtpEnabled, isSmtpReady } from '../../lib/comms/smtp-ready.js';

test('smtp helpers treat missing smtpEnabled as on', () => {
    const config = { smtpHost: 'smtp.example.com', smtpUser: 'u', smtpPass: 'p' };
    assert.equal(isSmtpEnabled(config), true);
    assert.equal(isSmtpConfigured(config), true);
    assert.equal(isSmtpReady(config), true);
});

test('smtp helpers honor an explicit off switch', () => {
    const config = {
        smtpEnabled: false,
        smtpHost: 'smtp.example.com',
        smtpUser: 'u',
        smtpPass: 'p',
    };
    assert.equal(isSmtpEnabled(config), false);
    assert.equal(isSmtpConfigured(config), true);
    assert.equal(isSmtpReady(config), false);
});

test('sendEmail skips when SMTP is disabled', async () => {
    const logs = [];
    const helpers = createEmailSendHelpers({
        usersPath: 'users.json',
        emailLogPath: 'email_log.json',
        loadFile: async () => [],
        saveFile: async () => {},
        appendAuditLog: async () => {},
        log: (message) => logs.push(String(message)),
    });

    const sent = await helpers.sendEmail({
        smtpEnabled: false,
        smtpHost: 'smtp.example.com',
        smtpUser: 'u',
        smtpPass: 'p',
        smtpFrom: 'noreply@example.com',
    }, 'sam@example.com', 'Hello', '<p>Hi</p>');

    assert.equal(sent, false);
    assert.match(logs.join('\n'), /disabled/i);
});
