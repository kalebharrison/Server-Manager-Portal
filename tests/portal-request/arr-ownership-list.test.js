import test from 'node:test';
import assert from 'node:assert/strict';

import {
    userOwnsArrRequesterLabel,
    listArrOwnershipDtosForUser,
} from '../../lib/portal-request/arrTagOwnershipImport.js';
import {
    buildNotifyTagForUser,
    buildPortalRequesterTagForUser,
} from '../../lib/portal-request/arrRequesterTags.js';

test('userOwnsArrRequesterLabel ignores notify tags', () => {
    const user = { id: '100', plexId: '100', username: 'kaleb' };
    assert.equal(userOwnsArrRequesterLabel('100-kaleb', user, [user]), true);
    assert.equal(userOwnsArrRequesterLabel('n-100-kaleb', user, [user]), false);
    assert.equal(userOwnsArrRequesterLabel('16-kaleb', user, [user]), false);
});

test('listArrOwnershipDtosForUser returns Arr-owned titles without portal JSON', async () => {
    const user = { id: '100', plexId: '100', username: 'kaleb' };
    const config = {
        mediaServerType: 'plex',
        arrInstances: [{
            id: 'radarr-1',
            type: 'radarr',
            name: 'Radarr',
            url: 'http://radarr:7878',
            apiKey: 'secret',
            enabled: true,
            isDefault: true,
        }],
    };

    const jsonResponse = (payload) => ({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => payload,
    });

    const fetchImpl = async (url, opts = {}) => {
        const href = String(url);
        if (href.endsWith('/api/v3/tag') && (!opts.method || opts.method === 'GET')) {
            return jsonResponse([
                { id: 1, label: '100-kaleb' },
                { id: 2, label: 'n-200-other' },
            ]);
        }
        if (href.endsWith('/api/v3/movie')) {
            return jsonResponse([
                {
                    id: 9,
                    tmdbId: 550,
                    title: 'Fight Club',
                    year: 1999,
                    hasFile: true,
                    tags: [1],
                    images: [{ coverType: 'poster', remoteUrl: 'https://image.tmdb.org/t/p/original/poster.jpg' }],
                },
                {
                    id: 10,
                    tmdbId: 111,
                    title: 'Someone Else',
                    year: 2000,
                    hasFile: true,
                    tags: [2],
                },
            ]);
        }
        return {
            ok: false,
            status: 404,
            headers: { get: () => 'application/json' },
            json: async () => ({}),
        };
    };

    const rows = await listArrOwnershipDtosForUser({
        config,
        user,
        portalUsers: [user],
        fetchImpl,
        includeTv: false,
    });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].tmdbId, 550);
    assert.equal(rows[0].engine, 'arr-tag');
    assert.equal(rows[0].posterPath, '/poster.jpg');
    assert.match(String(rows[0].id), /^arr-movie-550/);
});

test('dual-linked users still get one portal-id tag', () => {
    const user = {
        id: 'portal',
        plexId: '16297230',
        jellyfinId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        username: 'carrowayjm',
    };
    assert.equal(buildPortalRequesterTagForUser(user, 'plex'), 'portal-carrowayjm');
    assert.equal(buildNotifyTagForUser(user, 'jellyfin'), 'n-portal-carrowayjm');
});
