import test from 'node:test';
import assert from 'node:assert/strict';

import {
    dedupeMemberRequestRows,
    memberRequestDedupeKey,
    pickPreferredMemberRequest,
} from '../../lib/portal-request/requestDtoHelpers.js';

test('memberRequestDedupeKey is per title (not per quality)', () => {
    assert.equal(
        memberRequestDedupeKey({ mediaType: 'movie', tmdbId: 1, is4k: false }),
        'movie|1',
    );
    assert.equal(
        memberRequestDedupeKey({ type: 'movie', tmdbId: 1, is4k: true }),
        'movie|1',
    );
});

test('pickPreferredMemberRequest prefers live rows over Arr-import seeds', () => {
    const live = { id: 1, status: 2, meta: {}, updatedAt: '2026-01-01T00:00:00.000Z' };
    const imported = {
        id: 2,
        status: 2,
        meta: { importedFromArrTag: true },
        updatedAt: '2026-06-01T00:00:00.000Z',
    };
    assert.equal(pickPreferredMemberRequest(live, imported), live);
    assert.equal(pickPreferredMemberRequest(imported, live), live);
});

test('dedupeMemberRequestRows merges HD+4K onto one card with qualities', () => {
    const rows = [
        {
            id: '10',
            mediaType: 'movie',
            tmdbId: 100,
            is4k: false,
            status: 2,
            meta: { importedFromArrTag: true },
            updatedAt: '2026-01-01T00:00:00.000Z',
        },
        {
            id: '11',
            mediaType: 'movie',
            tmdbId: 100,
            is4k: false,
            status: 1,
            meta: {},
            updatedAt: '2026-07-01T00:00:00.000Z',
        },
        {
            id: '12',
            mediaType: 'movie',
            tmdbId: 100,
            is4k: true,
            status: 1,
            meta: {},
            updatedAt: '2026-06-01T00:00:00.000Z',
        },
    ];
    const deduped = dedupeMemberRequestRows(rows);
    assert.equal(deduped.length, 1);
    assert.equal(deduped[0].id, '11');
    assert.deepEqual(deduped[0].meta.requestQualities, { hd: true, '4k': true });
});
