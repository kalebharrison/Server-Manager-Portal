import assert from 'node:assert/strict';
import test from 'node:test';

import { isSeasonOneComplete } from '../../lib/portal-request/libraryAvailability.js';

test('isSeasonOneComplete: true when S1 files cover expected count', () => {
    assert.equal(isSeasonOneComplete({
        seasons: [
            { seasonNumber: 0, statistics: { episodeCount: 2, episodeFileCount: 0 } },
            { seasonNumber: 1, statistics: { episodeCount: 10, episodeFileCount: 10, percentOfEpisodes: 100 } },
            { seasonNumber: 2, statistics: { episodeCount: 10, episodeFileCount: 0 } },
        ],
    }), true);
});

test('isSeasonOneComplete: false when S1 is partial', () => {
    assert.equal(isSeasonOneComplete({
        seasons: [
            { seasonNumber: 1, statistics: { episodeCount: 10, episodeFileCount: 3, percentOfEpisodes: 30 } },
        ],
    }), false);
});

test('isSeasonOneComplete: false when S1 missing', () => {
    assert.equal(isSeasonOneComplete({
        seasons: [
            { seasonNumber: 2, statistics: { episodeCount: 8, episodeFileCount: 8 } },
        ],
    }), false);
});

test('isSeasonOneComplete: accepts percentOfEpisodes when episodeCount absent', () => {
    assert.equal(isSeasonOneComplete({
        seasons: [
            { seasonNumber: 1, statistics: { episodeFileCount: 8, percentOfEpisodes: 100 } },
        ],
    }), true);
});
