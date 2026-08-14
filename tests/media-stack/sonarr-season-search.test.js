import test from 'node:test';
import assert from 'node:assert/strict';
import {
    monitoredSonarrSeasonNumbers,
    triggerSonarrSeasonSearches,
    triggerArrEntitySearch,
} from '../../lib/arr-service.js';

const jsonFetch = (bodies) => async (_url, options = {}) => {
    bodies.push(JSON.parse(options.body));
    return {
        ok: true,
        headers: { get: () => 'application/json' },
        json: async () => ({ id: bodies.length }),
    };
};

test('monitoredSonarrSeasonNumbers skips specials and unmonitored', () => {
    assert.deepEqual(
        monitoredSonarrSeasonNumbers([
            { seasonNumber: 0, monitored: true },
            { seasonNumber: 1, monitored: true },
            { seasonNumber: 2, monitored: false },
            { seasonNumber: 3, monitored: true },
            { seasonNumber: 1, monitored: true },
        ]),
        [1, 3],
    );
});

test('triggerSonarrSeasonSearches posts SeasonSearch per monitored season', async () => {
    const bodies = [];
    const result = await triggerSonarrSeasonSearches(
        { enabled: true, url: 'http://sonarr.test', apiKey: 'key' },
        42,
        [
            { seasonNumber: 0, monitored: true },
            { seasonNumber: 1, monitored: true },
            { seasonNumber: 2, monitored: true },
            { seasonNumber: 3, monitored: false },
        ],
        { fetchImpl: jsonFetch(bodies), resolveUrl: (url) => url },
    );

    assert.equal(result.ok, true);
    assert.deepEqual(result.seasonNumbers, [1, 2]);
    assert.deepEqual(bodies, [
        { name: 'SeasonSearch', seriesId: 42, seasonNumber: 1 },
        { name: 'SeasonSearch', seriesId: 42, seasonNumber: 2 },
    ]);
});

test('triggerSonarrSeasonSearches falls back to SeriesSearch when no seasons', async () => {
    const bodies = [];
    const result = await triggerSonarrSeasonSearches(
        { enabled: true, url: 'http://sonarr.test', apiKey: 'key' },
        7,
        [],
        { fetchImpl: jsonFetch(bodies), resolveUrl: (url) => url },
    );
    assert.equal(result.ok, true);
    assert.deepEqual(bodies, [{ name: 'SeriesSearch', seriesId: 7 }]);
});

test('triggerArrEntitySearch uses season searches for Sonarr', async () => {
    const bodies = [];
    const result = await triggerArrEntitySearch(
        { enabled: true, url: 'http://sonarr.test', apiKey: 'key' },
        {
            id: 11,
            seasons: [
                { seasonNumber: 1, monitored: true },
                { seasonNumber: 2, monitored: true },
            ],
        },
        'sonarr',
        { fetchImpl: jsonFetch(bodies), resolveUrl: (url) => url },
    );
    assert.equal(result.ok, true);
    assert.deepEqual(bodies, [
        { name: 'SeasonSearch', seriesId: 11, seasonNumber: 1 },
        { name: 'SeasonSearch', seriesId: 11, seasonNumber: 2 },
    ]);
});
