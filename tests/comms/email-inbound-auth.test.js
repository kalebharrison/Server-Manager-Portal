import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';

import {
    createInboundWebhookToken,
    extractInboundWebhookToken,
    inboundWebhookAuthorized,
} from '../../lib/comms/email-inbound-auth.js';
import { registerMailjetInboundRoutes } from '../../lib/comms/email-inbound-webhook.js';

const withServer = async (app, run) => {
    const server = app.listen(0);
    const { port } = server.address();
    try {
        return await run(port);
    } finally {
        await new Promise((resolve) => server.close(resolve));
    }
};

test('inbound webhook token is extracted from Bearer or custom header', () => {
    const token = createInboundWebhookToken();
    assert.equal(token.length, 64);
    assert.equal(extractInboundWebhookToken({ headers: { authorization: `Bearer ${token}` } }), token);
    assert.equal(extractInboundWebhookToken({ headers: { 'x-portal-inbound-token': token } }), token);
    assert.equal(inboundWebhookAuthorized({ headers: { authorization: `Bearer ${token}` } }, token), true);
    assert.equal(inboundWebhookAuthorized({ headers: { authorization: 'Bearer nope' } }, token), false);
    assert.equal(inboundWebhookAuthorized({ headers: {} }, token), false);
});

test('inbound webhook requires a matching bearer token', async () => {
    const token = createInboundWebhookToken();
    const app = express();
    app.use(express.json());
    registerMailjetInboundRoutes({
        app,
        configPath: 'config.json',
        usersPath: 'users.json',
        issuePath: 'issues.json',
        requestsDir: '/tmp/unused-requests',
        loadFile: async () => ({
            inboundRepliesEnabled: true,
            mailjetInboundSecret: 'inbound-test-secret-0123456789abcdef0123456789abcdef',
            inboundWebhookToken: token,
        }),
        saveFile: async () => {},
    });

    await withServer(app, async (port) => {
        const url = `http://127.0.0.1:${port}/api/webhooks/inbound-email`;
        const body = JSON.stringify({
            Sender: 'sam@example.com',
            Recipient: 't.smtp.deadbeefdeadbeef@reply.example.com',
            'Text-part': 'hi',
        });
        const denied = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body,
        });
        assert.equal(denied.status, 401);
        const allowed = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
            },
            body,
        });
        assert.equal(allowed.status, 200);
        const payload = await allowed.json();
        assert.equal(payload.ok, true);
    });
});
