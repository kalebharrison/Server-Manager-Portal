import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';

import { createSelectiveJsonParser } from '../../lib/http/json-body.js';

const withServer = async (app, run) => {
    const server = app.listen(0);
    const { port } = server.address();
    try {
        return await run(port);
    } finally {
        await new Promise((resolve) => server.close(resolve));
    }
};

test('inbound webhook accepts large JSON while other API routes stay capped', async () => {
    const app = express();
    app.use(createSelectiveJsonParser());
    app.post('/api/webhooks/mailjet-inbound', (req, res) => res.json({ ok: true, bytes: JSON.stringify(req.body).length }));
    app.post('/api/config', (req, res) => res.json({ ok: true }));

    await withServer(app, async (port) => {
        const bulky = { 'Text-part': 'x'.repeat(80_000), Recipient: 't.smtp.test@reply.lostwaldo.net' };
        const inbound = await fetch(`http://127.0.0.1:${port}/api/webhooks/mailjet-inbound`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(bulky),
        });
        assert.equal(inbound.status, 200);
        const other = await fetch(`http://127.0.0.1:${port}/api/config`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(bulky),
        });
        assert.equal(other.status, 413);
    });
});
