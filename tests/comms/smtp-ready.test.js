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

test('test mail html requests a constrained inline logo', () => {
    const html = buildSmtpTestHtml({ smtpFrom: 'LostWaldo <a@b.c>' });
    assert.equal(shouldAttachInlineLogo(html), true);
    assert.match(html, /max-height:72px/);
    assert.equal(shouldAttachInlineLogo('<p>no logo</p>'), false);
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
    assert.equal(isAdminEmailRecipient({
        ...config,
        smtpFrom: 'LostWaldo <requests@lostwaldo.net>',
    }, users, 'requests@lostwaldo.net'), true);
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

test('sendEmail uses explicit Reply-To and never defaults to contactEmail', async () => {
    const sent = [];
    const helpers = createEmailSendHelpers({
        usersPath: 'users.json',
        emailLogPath: 'email_log.json',
        loadFile: async () => [{ id: 'u1', username: 'sam', email: 'sam@example.com' }],
        saveFile: async () => {},
        appendAuditLog: async () => {},
        log: () => {},
    });

    await helpers.sendEmail({
        smtpEnabled: true,
        smtpHost: 'smtp.example.com',
        smtpUser: 'u',
        smtpPass: 'p',
        smtpFrom: 'LostWaldo <requests@lostwaldo.net>',
        contactEmail: 'owner@lostwaldo.net',
    }, 'sam@example.com', 'Hello', '<p>Hi</p>', {
        sendMail: async (options) => {
            sent.push(options);
            return { messageId: '<test>' };
        },
    });

    assert.equal(sent.length, 1);
    assert.equal(sent[0].replyTo, undefined);

    await helpers.sendEmail({
        smtpEnabled: true,
        smtpHost: 'smtp.example.com',
        smtpUser: 'u',
        smtpPass: 'p',
        smtpFrom: 'LostWaldo <requests@lostwaldo.net>',
        contactEmail: 'owner@lostwaldo.net',
    }, 'sam@example.com', 'Hello', '<p>Hi</p>', {
        sendMail: async (options) => {
            sent.push(options);
            return { messageId: '<test-2>' };
        },
    }, { replyTo: 'replies+r.9.aaaaaaaaaaaaaaaa@reply.lostwaldo.net' });

    assert.equal(sent[1].replyTo, 'replies+r.9.aaaaaaaaaaaaaaaa@reply.lostwaldo.net');
});
