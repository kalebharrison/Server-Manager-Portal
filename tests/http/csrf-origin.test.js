import assert from 'node:assert/strict';
import test from 'node:test';

import { createCsrfOriginMiddleware } from '../../lib/http/csrf-origin.js';

const run = (middleware, req) => new Promise((resolve) => {
    const res = {
        statusCode: 200,
        body: null,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(payload) {
            this.body = payload;
            resolve({ statusCode: this.statusCode, body: payload, next: false });
        },
    };
    middleware(req, res, () => resolve({ statusCode: 200, body: null, next: true }));
});

test('csrf origin middleware allows same-origin mutating API calls', async () => {
    const middleware = createCsrfOriginMiddleware({ publicBaseUrl: 'https://portal.example.com' });
    const result = await run(middleware, {
        method: 'POST',
        path: '/api/config',
        headers: {
            host: 'portal.example.com',
            origin: 'https://portal.example.com',
        },
    });
    assert.equal(result.next, true);
});

test('csrf origin middleware blocks cross-site mutating API calls', async () => {
    const middleware = createCsrfOriginMiddleware({});
    const result = await run(middleware, {
        method: 'POST',
        path: '/api/users/preferences',
        headers: {
            host: 'portal.example.com',
            origin: 'https://evil.example',
        },
    });
    assert.equal(result.next, false);
    assert.equal(result.statusCode, 403);
});

test('csrf origin middleware ignores safe methods', async () => {
    const middleware = createCsrfOriginMiddleware({});
    const result = await run(middleware, {
        method: 'GET',
        path: '/api/users/me',
        headers: {
            host: 'portal.example.com',
            origin: 'https://evil.example',
        },
    });
    assert.equal(result.next, true);
});
