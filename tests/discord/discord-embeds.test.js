import assert from 'node:assert/strict';
import test from 'node:test';

import {
    DISCORD_COLORS,
    mediaEmbed,
    parseCustomId,
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
});

test('parseCustomId splits kind and parts', () => {
    assert.deepEqual(parseCustomId('dreq-confirm:user1:tv:123:all'), {
        kind: 'dreq-confirm',
        parts: ['user1', 'tv', '123', 'all'],
        raw: 'dreq-confirm:user1:tv:123:all',
    });
    assert.deepEqual(parseCustomId(''), { kind: '', parts: [], raw: '' });
});
