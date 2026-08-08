import assert from 'node:assert/strict';
import test from 'node:test';

import { createEmailSendHelpers, shouldAttachInlineLogo } from '../../lib/comms/email-send.js';
import { buildSmtpTestHtml } from '../../lib/comms/email-templates.js';
import {
    allowSmtpRecipient,
    isAdminEmailRecipient,
    isSmtpConfigured,
    isSmtpEnabled,
    isSmtpReady,
} from '../../lib/comms/smtp-ready.js';

test('test mail html does not request an inline logo', () => {
    assert.equal(shouldAttachInlineLogo(buildSmtpTestHtml()), false);
    assert.equal(shouldAttachInlineLogo('<img src="cid:logo" alt="">'), true);
});

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

test('admin-only SMTP allows portal admins and skips members', async () => {
    const users = [
        { id: 'a1', username: 'admin', email: 'admin@example.com', isPortalAdmin: true },
        { id: 'u1', username: 'sam', email: 'sam@example.com' },
    ];
    const config = {
        smtpEnabled: true,
        smtpAdminOnly: true,
        smtpHost: 'smtp.example.com',
        smtpUser: 'u',
        smtpPass: 'p',
        smtpFrom: 'noreply@example.com',
    };

    assert.equal(isAdminEmailRecipient(config, users, 'admin@example.com'), true);
    assert.equal(isAdminEmailRecipient(config, users, 'sam@example.com'), false);
    assert.equal(allowSmtpRecipient(config, users, 'sam@example.com'), false);
    assert.equal(allowSmtpRecipient(config, users, 'sam@example.com', { allowAnyRecipient: true }), true);

    const logs = [];
    const helpers = createEmailSendHelpers({
        usersPath: 'users.json',
        emailLogPath: 'email_log.json',
        loadFile: async () => users,
        saveFile: async () => {},
        appendAuditLog: async () => {},
        log: (message) => logs.push(String(message)),
    });

    const skipped = await helpers.sendEmail(config, 'sam@example.com', 'Hello', '<p>Hi</p>');
    assert.equal(skipped, false);
    assert.match(logs.join('\n'), /admin-only/i);
});
