import assert from 'node:assert/strict';
import test from 'node:test';

import { registerRequestAppRoutes } from '../../lib/request-app/request-app-routes.js';

const imageHandlerFor = (requestAppService) => {
    let handler;
    const app = {
        get(path, ...handlers) { if (path === '/api/request-app/image') handler = handlers.at(-1); },
        post() {},
        delete() {},
    };
    registerRequestAppRoutes({
        app,
        requireAuth() {},
        requireMember() {},
        requireAdmin() {},
        configPath: 'config.json',
        loadFile: async () => ({}),
        requestAppService,
        appendAuditLog: async () => {},
        log() {},
    });
    return handler;
};

test('request poster misses redirect immediately while warming in the background', async () => {
    let warmed = '';
    const handler = imageHandlerFor({
        getCachedPosterImage: (url) => ({ remoteUrl: url, image: null }),
        warmPosterImage: async (url) => { warmed = url; },
    });
    const headers = {};
    let redirect;
    await handler({ query: { url: 'https://image.tmdb.org/t/p/w342/a.jpg' } }, {
        setHeader(name, value) { headers[name] = value; },
        redirect(status, url) { redirect = { status, url }; },
        status() { return this; },
        json() {},
    });

    await Promise.resolve();
    assert.deepEqual(redirect, { status: 307, url: 'https://image.tmdb.org/t/p/w342/a.jpg' });
    assert.equal(headers['Cache-Control'], 'private, max-age=300');
    assert.equal(warmed, 'https://image.tmdb.org/t/p/w342/a.jpg');
});
