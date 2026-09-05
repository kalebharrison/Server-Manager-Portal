import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import express from 'express';

import { registerArrIntegrityTriggerRoutes } from '../../lib/upgrader/arr-integrity-triggers.js';

describe('arr integrity import → portal status sync', () => {
    it('invokes onImportComplete for Download import events', async () => {
        const calls = [];
        const app = express();
        app.use(express.json());
        registerArrIntegrityTriggerRoutes({
            app,
            configPath: '/tmp/config.json',
            loadFile: async () => ({
                upgraderEnabled: true,
                qcIntegrityEnabled: true,
                qcIntegrityWebhookUsername: 'hook',
                qcIntegrityWebhookPassword: 'secret',
                arrInstances: [],
            }),
            log: () => {},
            onImportComplete: async (payload) => {
                calls.push(payload);
            },
        });

        const server = app.listen(0);
        const { port } = server.address();
        const auth = Buffer.from('hook:secret').toString('base64');
        try {
            const res = await fetch(`http://127.0.0.1:${port}/triggers/radarr`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Basic ${auth}`,
                },
                body: JSON.stringify({
                    eventType: 'Download',
                    movie: { id: 3103, title: 'Sorry, Baby', tmdbId: 1205515, hasFile: true },
                }),
            });
            assert.equal(res.status, 200);
            await new Promise((r) => setImmediate(r));
            assert.equal(calls.length, 1);
            assert.equal(calls[0].kind, 'radarr');
            assert.equal(calls[0].event.action, 'import');
        } finally {
            await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
        }
    });
});
