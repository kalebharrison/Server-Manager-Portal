import test from 'node:test';
import assert from 'node:assert/strict';
import {
    filterDeniedHuntReleases,
    parseHuntIndexerDeny,
} from '../../lib/upgrader/upgrader-hunt-indexers.js';

test('parseHuntIndexerDeny defaults to bitmagnet when empty', () => {
    assert.deepEqual(parseHuntIndexerDeny(''), ['bitmagnet']);
    assert.deepEqual(parseHuntIndexerDeny(null), ['bitmagnet']);
    assert.deepEqual(parseHuntIndexerDeny('BitMagnet, yts'), ['bitmagnet', 'yts']);
});

test('filterDeniedHuntReleases drops matching indexer names', () => {
    const kept = filterDeniedHuntReleases([
        { title: 'Good.Remux', indexer: 'NZBgeek (Prowlarr)', customFormatScore: 5000 },
        { title: 'Dht.UHDRemux', indexer: 'BitMagnet (Local DHT) (Prowlarr)', customFormatScore: 9000 },
    ], {});
    assert.equal(kept.length, 1);
    assert.equal(kept[0].title, 'Good.Remux');
});
