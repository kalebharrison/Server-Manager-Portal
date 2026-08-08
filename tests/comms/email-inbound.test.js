import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
    buildInboundReplyTo,
    extractInboundReplyBody,
    parseInboundRecipient,
} from '../../lib/comms/email-inbound.js';
import { processMailjetInbound } from '../../lib/comms/email-inbound-process.js';

const SECRET = 'inbound-test-secret-0123456789abcdef0123456789abcdef';
const ISSUE_ID = 'portal:550e8400-e29b-41d4-a716-446655440000';

const baseConfig = {
    smtpFrom: 'Requests - LostWaldo <requests@lostwaldo.net>',
    mailjetInboundSecret: SECRET,
};

test('inbound reply-to encodes a signed plus-address on reply subdomain', () => {
    const replyTo = buildInboundReplyTo(baseConfig, { kind: 'request', id: 9 });
    assert.match(replyTo, /^replies\+r\.9\.[a-f0-9]{16}@reply\.lostwaldo\.net$/);
    assert.deepEqual(parseInboundRecipient(replyTo, SECRET), { kind: 'request', id: '9' });
    assert.equal(parseInboundRecipient(replyTo, 'wrong-secret'), null);
});

test('inbound reply-to round-trips portal issue ids', () => {
    const replyTo = buildInboundReplyTo(baseConfig, { kind: 'issue', id: ISSUE_ID });
    assert.deepEqual(parseInboundRecipient(`LostWaldo <${replyTo}>`, SECRET), {
        kind: 'issue',
        id: ISSUE_ID,
    });
});

test('quoted reply text is stripped before storing', () => {
    const body = extractInboundReplyBody([
        'Still buffering on episode 3.',
        '',
        'On Sat, Aug 8, 2026 at 6:00 PM Requests - LostWaldo wrote:',
        '> Your issue was updated.',
    ].join('\n'));
    assert.equal(body, 'Still buffering on episode 3.');
});

test('inbound webhook appends a verified member comment on a portal issue', async () => {
    const issuePath = 'media-issues.json';
    const issues = [{
        id: ISSUE_ID,
        source: 'portal',
        title: 'Bad audio',
        reporterId: 'u1',
        comments: [],
    }];
    const users = [{ id: 'u1', username: 'sam', email: 'sam@example.com' }];
    const replyTo = buildInboundReplyTo(baseConfig, { kind: 'issue', id: ISSUE_ID });
    const adminEvents = [];

    const result = await processMailjetInbound({
        config: baseConfig,
        payload: {
            Sender: 'sam@example.com',
            Recipient: replyTo,
            'Text-part': 'Fixed after a remux?\n\nOn Sat wrote:\n> old',
            Headers: { 'Message-ID': '<msg-1@mail.gmail.com>' },
        },
        usersPath: 'users.json',
        issuePath,
        requestsDir: '/tmp/unused-requests',
        loadFile: async (filePath, fallback) => {
            if (filePath === 'users.json') return users;
            if (filePath === issuePath) return issues;
            return fallback;
        },
        saveFile: async (filePath, value) => {
            if (filePath === issuePath) {
                issues.splice(0, issues.length, ...value);
            }
        },
        discordNotifier: {
            postAdminEvent: async (_config, payload) => {
                adminEvents.push(payload);
                return true;
            },
        },
    });

    assert.equal(result.applied, 'issue');
    assert.equal(issues[0].comments.length, 1);
    assert.equal(issues[0].comments[0].message, 'Fixed after a remux?');
    assert.equal(issues[0].comments[0].author, 'sam');
    assert.equal(adminEvents.length, 1);

    const dup = await processMailjetInbound({
        config: baseConfig,
        payload: {
            Sender: 'sam@example.com',
            Recipient: replyTo,
            'Text-part': 'Fixed after a remux?',
            Headers: { 'Message-ID': '<msg-1@mail.gmail.com>' },
        },
        usersPath: 'users.json',
        issuePath,
        requestsDir: '/tmp/unused-requests',
        loadFile: async (filePath, fallback) => {
            if (filePath === 'users.json') return users;
            if (filePath === issuePath) return issues;
            return fallback;
        },
        saveFile: async () => {},
    });
    assert.equal(dup.skipped, 'duplicate');
    assert.equal(issues[0].comments.length, 1);
});

test('inbound webhook stores a verified request reply and rejects spoofed senders', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'smp-inbound-'));
    const { createJsonRequestStore } = await import('../../lib/portal-request/requestStore.js');
    const store = createJsonRequestStore({ dataDir: tmp });
    const record = await store.create({
        userId: 'u1',
        mediaType: 'movie',
        tmdbId: 438631,
        title: 'Dune',
    });
    const replyTo = buildInboundReplyTo(baseConfig, { kind: 'request', id: record.id });
    const users = [{ id: 'u1', username: 'sam', email: 'sam@example.com' }];

    const spoofed = await processMailjetInbound({
        config: baseConfig,
        payload: {
            Sender: 'attacker@example.com',
            Recipient: replyTo,
            'Text-part': 'please expedite',
        },
        usersPath: 'users.json',
        issuePath: 'media-issues.json',
        requestsDir: tmp,
        loadFile: async (filePath, fallback) => (filePath === 'users.json' ? users : fallback),
        saveFile: async () => {},
    });
    assert.equal(spoofed.skipped, 'sender-mismatch');

    const applied = await processMailjetInbound({
        config: baseConfig,
        payload: {
            Sender: 'Sam <sam@example.com>',
            Recipient: replyTo,
            'Text-part': 'Any ETA on 4K?',
        },
        usersPath: 'users.json',
        issuePath: 'media-issues.json',
        requestsDir: tmp,
        loadFile: async (filePath, fallback) => (filePath === 'users.json' ? users : fallback),
        saveFile: async () => {},
    });
    assert.equal(applied.applied, 'request');
    const updated = await store.get(record.id);
    assert.equal(updated.meta.emailReplies.length, 1);
    assert.equal(updated.meta.emailReplies[0].message, 'Any ETA on 4K?');
    await fs.rm(tmp, { recursive: true, force: true });
});
