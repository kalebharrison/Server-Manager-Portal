import assert from 'node:assert/strict';
import test from 'node:test';

import { createPlexSessionsSnapshot } from '../../lib/plex/plex-sessions-snapshot.js';

test('plex sessions snapshot reuses short-ttl payload across callers', async () => {
    let calls = 0;
    const snapshot = createPlexSessionsSnapshot({
        ttlMs: 60_000,
        fetchImpl: async () => {
            calls += 1;
            return {
                ok: true,
                json: async () => ({
                    MediaContainer: {
                        size: 1,
                        Metadata: [{ title: 'Movie', sessionKey: '1' }],
                    },
                }),
            };
        },
    });

    const config = { plexToken: 'tok', serverIdentifier: 'server-1' };
    const uri = 'http://plex.local';
    const a = await snapshot.fetchSessionsPayload(config, uri);
    const b = await snapshot.fetchSessionsMetadata(config, uri);
    assert.equal(calls, 1);
    assert.equal(a.MediaContainer.size, 1);
    assert.equal(b[0].title, 'Movie');
});
