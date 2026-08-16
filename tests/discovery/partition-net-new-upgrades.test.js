import assert from 'node:assert/strict';
import test from 'node:test';

import { partitionNetNewAndUpgrades } from '../../client/discovery/discoverRailUtils.ts';

test('partitionNetNewAndUpgrades keeps upgrades off the net-new rail', () => {
    const recent = [
        { id: 1, tmdbId: 1, mediaType: 'movie', title: 'New Movie' },
        { id: 2, tmdbId: 2, mediaType: 'movie', title: 'Upgraded Movie' },
        { id: 3, tmdbId: 3, mediaType: 'movie', title: 'Another New' },
    ];
    const upgrades = [
        { id: 2, tmdbId: 2, mediaType: 'movie', title: 'Upgraded Movie' },
        { id: 2, tmdbId: 2, mediaType: 'movie', title: 'Upgraded Movie Dup' },
    ];

    const { recentlyAdded, recentlyUpgraded } = partitionNetNewAndUpgrades(recent, upgrades, { maxPerRail: 24 });

    assert.deepEqual(recentlyAdded.map((item) => item.tmdbId), [1, 3]);
    assert.equal(recentlyAdded.every((item) => item.acquisitionKind === 'new'), true);
    assert.deepEqual(recentlyUpgraded.map((item) => item.tmdbId), [2]);
    assert.equal(recentlyUpgraded[0].acquisitionKind, 'upgrade');
});
