import assert from 'node:assert/strict';
import test from 'node:test';

import {
    DISCORD_COLORS,
    mediaEmbed,
    mediaTypeLabel,
    parseCustomId,
    resolveDiscordPosterUrl,
    statusColor,
    statusLabel,
    truncate,
} from '../../lib/discord/discord-embeds.js';

test('statusColor and statusLabel follow availability state', () => {
    assert.equal(statusColor({ available: true }), DISCORD_COLORS.good);
    assert.equal(statusLabel({ available: true }), 'Available');
    assert.equal(statusColor({ processing: true }), DISCORD_COLORS.warn);
    assert.equal(statusLabel({ pending: true }), 'Pending');
    assert.equal(statusColor({ error: true }), DISCORD_COLORS.bad);
});

test('truncate shortens long strings', () => {
    assert.equal(truncate('abc', 10), 'abc');
    assert.equal(truncate('abcdefghij', 5), 'abcd…');
});

test('resolveDiscordPosterUrl unwraps portal proxy and posterPath', () => {
    assert.equal(
        resolveDiscordPosterUrl({ posterPath: '/abc.jpg' }),
        'https://image.tmdb.org/t/p/w500/abc.jpg',
    );
    assert.equal(
        resolveDiscordPosterUrl({
            posterUrl: '/api/request-app/image?url=https%3A%2F%2Fimage.tmdb.org%2Ft%2Fp%2Fw300%2Fxyz.jpg',
        }),
        'https://image.tmdb.org/t/p/w500/xyz.jpg',
    );
});

test('mediaTypeLabel uses portal-friendly casing', () => {
    assert.equal(mediaTypeLabel('movie'), 'Movie');
    assert.equal(mediaTypeLabel('tv'), 'TV');
    assert.equal(mediaTypeLabel('MOVIE'), 'Movie');
});

test('mediaEmbed shapes title status and optional poster', () => {
    const embed = mediaEmbed({
        title: 'Dune',
        overview: 'Sand.',
        year: 2021,
        mediaType: 'movie',
        available: true,
        posterUrl: 'https://image.tmdb.org/t/p/w500/poster.jpg',
    }, { footer: 'as alice' });
    const data = embed.toJSON();
    assert.equal(data.title, 'Dune');
    assert.equal(data.color, DISCORD_COLORS.good);
    assert.equal(data.thumbnail.url, 'https://image.tmdb.org/t/p/w500/poster.jpg');
    assert.equal(data.footer.text, 'as alice');
    assert.ok(data.fields.some((field) => field.name === 'Status' && field.value === 'Available'));
    assert.ok(data.fields.some((field) => field.name === 'Type' && field.value === 'Movie'));
});

test('mediaEmbed largeImage uses setImage', () => {
    const data = mediaEmbed({
        title: 'Dune',
        posterPath: '/poster.jpg',
    }, { largeImage: true }).toJSON();
    assert.equal(data.image.url, 'https://image.tmdb.org/t/p/w780/poster.jpg');
});

test('parseCustomId splits kind and parts', () => {
    assert.deepEqual(parseCustomId('dreq-confirm:user1:tv:123:all'), {
        kind: 'dreq-confirm',
        parts: ['user1', 'tv', '123', 'all'],
        raw: 'dreq-confirm:user1:tv:123:all',
    });
    assert.deepEqual(parseCustomId(''), { kind: '', parts: [], raw: '' });
});
