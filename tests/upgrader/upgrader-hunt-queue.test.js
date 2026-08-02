import test from 'node:test';
import assert from 'node:assert/strict';
import {
    buildHuntQueue,
    libraryKeyForItem,
    nextCooldownUntil,
    pruneCooldowns,
} from '../../lib/upgrader/upgrader-hunt-queue.js';

const item = (partial) => ({
    hasFile: true,
    mediaType: 'movie',
    avgCustomFormatScore: 0,
    ...partial,
});

test('libraryKeyForItem is per Sonarr/Radarr library', () => {
    assert.equal(libraryKeyForItem({ arrType: 'radarr', arrInstanceId: 'r1' }), 'radarr:r1');
    assert.equal(libraryKeyForItem({ arrType: 'sonarr', arrInstanceId: 's1' }), 'sonarr:s1');
});

test('buildHuntQueue round-robins libraries and respects maxPerLibrary', () => {
    const items = [
        item({ ratingKey: 'r-a', arrType: 'radarr', arrInstanceId: 'radarr', arrInstanceName: 'Radarr', avgCustomFormatScore: 0 }),
        item({ ratingKey: 'r-b', arrType: 'radarr', arrInstanceId: 'radarr', arrInstanceName: 'Radarr', avgCustomFormatScore: 10 }),
        item({ ratingKey: 'r-c', arrType: 'radarr', arrInstanceId: 'radarr', arrInstanceName: 'Radarr', avgCustomFormatScore: 20 }),
        item({ ratingKey: 's-a', arrType: 'sonarr', arrInstanceId: 'sonarr', arrInstanceName: 'Sonarr', mediaType: 'show', episodeCount: 3, avgCustomFormatScore: 1 }),
        item({ ratingKey: 's-b', arrType: 'sonarr', arrInstanceId: 'sonarr', arrInstanceName: 'Sonarr', mediaType: 'show', episodeCount: 3, avgCustomFormatScore: 5 }),
    ];

    const planned = buildHuntQueue(items, { maxPerLibrary: 2, libraryCursor: 0 });
    assert.equal(planned.libraries.length, 2);
    assert.equal(planned.queue.length, 4);
    // Interleaved: first from radarr, first from sonarr, second from radarr, second from sonarr
    assert.deepEqual(planned.queue.map((entry) => entry.ratingKey), ['r-a', 's-a', 'r-b', 's-b']);
    assert.equal(planned.nextLibraryCursor, 1);
});

test('buildHuntQueue skips cooldowns and snoozes', () => {
    const now = Date.parse('2026-08-02T00:00:00.000Z');
    const items = [
        item({ ratingKey: 'hot', arrType: 'radarr', arrInstanceId: 'radarr', avgCustomFormatScore: 0 }),
        item({ ratingKey: 'cold', arrType: 'radarr', arrInstanceId: 'radarr', avgCustomFormatScore: 1 }),
    ];
    const planned = buildHuntQueue(items, {
        now,
        maxPerLibrary: 5,
        cooldowns: { cold: { until: '2026-08-03T00:00:00.000Z', reason: 'noUpgrade' } },
    });
    assert.deepEqual(planned.queue.map((entry) => entry.ratingKey), ['hot']);
});

test('pruneCooldowns drops expired entries', () => {
    const now = Date.parse('2026-08-02T12:00:00.000Z');
    const pruned = pruneCooldowns({
        keep: { until: '2026-08-03T00:00:00.000Z' },
        drop: { until: '2026-08-01T00:00:00.000Z' },
    }, now);
    assert.ok(pruned.keep);
    assert.equal(pruned.drop, undefined);
    const until = nextCooldownUntil('grabbed', now);
    assert.ok(Date.parse(until) > now);
});
