import test from 'node:test';
import assert from 'node:assert/strict';

import {
    userOwnsArrRequesterLabel,
    listArrOwnershipDtosForUser,
    normalizeArrRequesterTagsOnArr,
    isSeerrStyleRequesterTag,
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
    assert.equal(buildPortalRequesterTagForUser(user, 'plex'), 'portal');
    assert.equal(buildNotifyTagForUser(user, 'jellyfin'), 'n-portal');
});

test('isSeerrStyleRequesterTag matches only 1-2 digit Seerr prefixes', () => {
    assert.equal(isSeerrStyleRequesterTag('16-i2ach'), true);
    assert.equal(isSeerrStyleRequesterTag('9-kaleb'), true);
    assert.equal(isSeerrStyleRequesterTag('100-kaleb'), false);
    assert.equal(isSeerrStyleRequesterTag('n-16-i2ach'), false);
    assert.equal(isSeerrStyleRequesterTag('anime'), false);
    assert.equal(isSeerrStyleRequesterTag('100'), false);
});

test('normalize corrects portal legacy tags but leaves Seerr tags alone', async () => {
    const user = { id: '100', plexId: '100', username: 'kaleb', seerrUserId: 16 };
    const config = {
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

    let putBody = null;
    let nextTagId = 10;
    const tags = [
        { id: 1, label: '100-kaleb' },
        { id: 2, label: 'n-100-kaleb' },
        { id: 3, label: '16-kaleb' },
        { id: 4, label: 'anime' },
    ];

    const jsonResponse = (payload) => ({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => payload,
    });

    const fetchImpl = async (url, opts = {}) => {
        const href = String(url);
        const method = String(opts.method || 'GET').toUpperCase();
        if (href.endsWith('/api/v3/tag') && method === 'GET') {
            return jsonResponse(tags);
        }
        if (href.endsWith('/api/v3/tag') && method === 'POST') {
            const body = JSON.parse(opts.body);
            const created = { id: nextTagId++, label: body.label };
            tags.push(created);
            return jsonResponse(created);
        }
        if (href.endsWith('/api/v3/movie') && method === 'GET') {
            return jsonResponse([{
                id: 9,
                tmdbId: 550,
                title: 'Fight Club',
                tags: [1, 2, 3, 4],
            }]);
        }
        if (href.endsWith('/api/v3/movie/9') && method === 'PUT') {
            putBody = JSON.parse(opts.body);
            return jsonResponse(putBody);
        }
        return {
            ok: false,
            status: 404,
            headers: { get: () => 'application/json' },
            json: async () => ({}),
        };
    };

    const summary = await normalizeArrRequesterTagsOnArr({
        config,
        portalUsers: [user],
        fetchImpl,
        includeTv: false,
    });

    assert.equal(summary.itemsUpdated, 1);
    assert.ok(summary.tagsCreated >= 1);
    assert.ok(summary.tagsCorrected >= 2);
    assert.ok(putBody);
    const labels = putBody.tags.map((id) => tags.find((tag) => tag.id === id)?.label);
    assert.deepEqual(new Set(labels), new Set(['100', 'n-100', '16-kaleb', 'anime']));
    assert.equal(labels.includes('100-kaleb'), false);
    assert.equal(labels.includes('n-100-kaleb'), false);
    assert.ok(labels.includes('16-kaleb'));
});
