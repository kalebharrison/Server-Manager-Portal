import assert from 'node:assert/strict';

/** Mirror of discoveryItemKey (keep in sync with discoverRailUtils.ts). */
const discoveryItemKey = (item) => {
    if (!item) return '';
    const mediaType = item.mediaType === 'tv' || item.type === 'tv' || item.type === 'show'
        || item.media?.mediaType === 'tv' || item.media?.type === 'tv'
        ? 'tv'
        : 'movie';
    const tmdbId = Number(
        item.tmdbId
        ?? item.media?.tmdbId
        ?? item.mediaId
        ?? item.id,
    );
    if (Number.isFinite(tmdbId) && tmdbId > 0) return `${mediaType}:${tmdbId}`;
    const title = String(item.title || item.name || item.media?.title || item.media?.name || '')
        .trim()
        .toLowerCase();
    return title ? `${mediaType}:${title}` : '';
};

const mine = {
    id: 12345,
    tmdbId: 12345,
    type: 'movie',
    mediaType: 'movie',
    title: 'The Invite',
    requestId: 999001,
    media: { tmdbId: 12345, mediaType: 'movie', title: 'The Invite' },
};

const other = {
    id: 12345,
    tmdbId: 12345,
    mediaType: 'movie',
    type: 'movie',
    title: 'The Invite',
};

const legacy = {
    id: 999001,
    type: 'movie',
    media: { tmdbId: 12345, mediaType: 'movie', title: 'The Invite' },
};

assert.equal(discoveryItemKey(mine), 'movie:12345');
assert.equal(discoveryItemKey(other), 'movie:12345');
assert.equal(discoveryItemKey(legacy), 'movie:12345');
assert.equal(discoveryItemKey(mine), discoveryItemKey(other));

const mineKeys = new Set([discoveryItemKey(mine)]);
assert.equal(mineKeys.has(discoveryItemKey(other)), true);

console.log('request rail dedupe keys ok');
