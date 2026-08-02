import test from 'node:test';
import assert from 'node:assert/strict';
import { groupOnTheWayDownloads } from '../../lib/media-stack/on-the-way-group.js';

test('groupOnTheWayDownloads lumps TV episodes into one season card', () => {
    const grouped = groupOnTheWayDownloads([
        {
            id: 'Sonarr-1',
            type: 'tv',
            service: 'Sonarr',
            title: 'Catch-22',
            seriesId: 9,
            seasonNumber: 1,
            episodeNumber: 1,
            progress: 10,
            phase: 'Needs Attention',
            acquisitionKind: 'upgrade',
            total: 100,
            downloaded: 10,
        },
        {
            id: 'Sonarr-2',
            type: 'tv',
            service: 'Sonarr',
            title: 'Catch-22',
            seriesId: 9,
            seasonNumber: 1,
            episodeNumber: 6,
            progress: 10,
            phase: 'Downloading',
            acquisitionKind: 'upgrade',
            total: 100,
            downloaded: 10,
        },
        {
            id: 'Radarr-3',
            type: 'movie',
            service: 'Radarr',
            title: 'Dune',
            progress: 50,
            phase: 'Downloading',
            acquisitionKind: 'new',
            total: 200,
            downloaded: 100,
        },
    ]);

    assert.equal(grouped.length, 2);
    const season = grouped.find((item) => item.type === 'tv');
    assert.equal(season.title, 'Catch-22');
    assert.equal(season.subtitle, 'Season 1 · E01–E06');
    assert.equal(season.episodeCount, 2);
    assert.equal(season.phase, 'Needs Attention');
    assert.equal(season.acquisitionLabel, 'Upgrade');
    assert.equal(season.progress, 10);
    assert.ok(grouped.some((item) => item.title === 'Dune'));
});

test('groupOnTheWayDownloads leaves single episodes alone', () => {
    const [only] = groupOnTheWayDownloads([{
        id: 'Sonarr-1',
        type: 'tv',
        service: 'Sonarr',
        title: 'Solo',
        subtitle: 'S02E04 - Alone',
        seriesId: 3,
        seasonNumber: 2,
        episodeNumber: 4,
        progress: 40,
        phase: 'Downloading',
        acquisitionKind: 'new',
    }]);
    assert.equal(only.subtitle, 'S02E04 - Alone');
    assert.equal(only.episodeCount, undefined);
});
