import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { createPortalRequestService } from '../../lib/portal-request/portalRequestService.js';

const jsonResponse = (payload) => ({
    ok: true,
    status: 200,
    headers: { get: () => 'application/json' },
    json: async () => payload,
});

test('listMemberRequests coalesces parallel Arr scans and skips count backfill', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'portal-member-list-cache-'));
    const user = { id: '100', plexId: '100', username: 'alice' };
    let movieHits = 0;

    const fetchImpl = async (url) => {
        const href = String(url);
        if (href.endsWith('/api/v3/tag')) {
            return jsonResponse([{ id: 1, label: '100-alice' }]);
        }
        if (href.endsWith('/api/v3/movie')) {
            movieHits += 1;
            await new Promise((resolve) => setTimeout(resolve, 40));
            return jsonResponse([{
                id: 9,
                tmdbId: 550,
                title: 'Fight Club',
                year: 1999,
                hasFile: true,
                tags: [1],
            }]);
        }
        return { ok: false, status: 404, headers: { get: () => 'application/json' }, json: async () => ({}) };
    };

    const service = createPortalRequestService({
        dataDir: dir,
        config: {
            mediaServerType: 'plex',
            arrInstances: [{
                id: 'radarr-cache-test',
                type: 'radarr',
                name: 'Radarr',
                url: 'http://radarr:7878',
                apiKey: 'secret',
                enabled: true,
                isDefault: true,
            }],
        },
        fetchImpl,
        listUsers: async () => [user],
    });

    const [first, second, counts] = await Promise.all([
        service.listMemberRequests(user, { take: 40 }),
        service.listMemberRequests(user, { take: 20 }),
        service.getMemberRequestCounts(user),
    ]);

    assert.equal(movieHits, 1);
    assert.equal(first.results.length, 1);
    assert.equal(second.results.length, 1);
    assert.equal(counts.total, 1);
    assert.equal(counts.available, 1);

    await service.listMemberRequests(user, { take: 40 });
    assert.equal(movieHits, 1);
});
