import assert from 'node:assert/strict';
import test from 'node:test';

import { createPlexImageService } from '../lib/plex-image-service.js';

test('Plex image service validates, bounds, and coalesces image requests', async () => {
    let calls = 0;
    let sourceUrl = '';
    const service = createPlexImageService({
        fetchWithTimeout: async (url) => {
            calls++;
            sourceUrl = url;
            return {
                ok: true,
                headers: { get: () => 'image/jpeg' },
                arrayBuffer: async () => Uint8Array.from([1, 2, 3]).buffer,
            };
        },
    });
    const input = {
        config: { serverIdentifier: 'server', plexToken: 'secret' },
        uri: 'http://plex:32400',
        path: '/library/metadata/1/thumb/2',
        width: 9000,
        height: 9000,
    };
    const [first, second] = await Promise.all([service.request(input), service.request(input)]);

    assert.equal(calls, 1);
    assert.deepEqual(first.body, second.body);
    assert.match(sourceUrl, /width=1200&height=1600/);
    await assert.rejects(() => service.request({ ...input, path: '/status/sessions' }), /Invalid Plex image path/);
});
