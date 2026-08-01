import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { createPortalRequestService } from '../../lib/portal-request/portalRequestService.js';
import { createJsonRequestStore } from '../../lib/portal-request/requestStore.js';

test('listMemberRequests backfills missing posters for sparse Arr-imported rows', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'portal-member-poster-'));
    const store = createJsonRequestStore({ dataDir: dir });
    await store.create({
        userId: 'user-1',
        mediaType: 'tv',
        tmdbId: 15260,
        title: 'Steven Universe',
        year: '2013',
        overview: '',
        posterPath: null,
        status: 2,
        meta: {
            // Still in-flight on Arr — available imported seeds are pruned from portal JSON.
            importedFromArrTag: true,
            mediaStatus: 3,
        },
    });

    const fetchImpl = async (url) => {
        const href = String(url);
        if (href.includes('/tv/15260')) {
            return {
                ok: true,
                status: 200,
                json: async () => ({
                    id: 15260,
                    name: 'Steven Universe',
                    first_air_date: '2013-11-04',
                    poster_path: '/steven.jpg',
                    backdrop_path: '/steven-bg.jpg',
                    overview: 'A boy and gems',
                    genres: [{ id: 16, name: 'Animation' }],
                    original_language: 'en',
                }),
            };
        }
        return { ok: false, status: 404, json: async () => ({}) };
    };

    const service = createPortalRequestService({
        dataDir: dir,
        config: { tmdbApiKey: 'test-key' },
        fetchImpl,
    });

    const listed = await service.listMemberRequests({ id: 'user-1' }, { take: 20, skip: 0 });
    assert.equal(listed.results.length, 1);
    assert.equal(listed.results[0].posterPath, '/steven.jpg');
    assert.match(listed.results[0].posterUrl, /\/steven\.jpg$/);

    const persisted = await store.get(listed.results[0].id);
    assert.equal(persisted.posterPath, '/steven.jpg');
    assert.equal(persisted.meta?.posterSource, 'tmdb');
});
