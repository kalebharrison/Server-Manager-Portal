import test from 'node:test';
import assert from 'node:assert/strict';
import { groupOnTheWayDownloads } from '../../lib/media-stack/on-the-way-group.js';

test('groupOnTheWayDownloads lumps TV episodes into one series card', () => {
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
    const series = grouped.find((item) => item.type === 'tv');
    assert.equal(series.title, 'Catch-22');
    assert.equal(series.subtitle, 'Season 1 · E01–E06');
    assert.equal(series.episodeCount, 2);
    assert.equal(series.phase, 'Needs Attention');
    assert.equal(series.acquisitionLabel, 'Upgrade');
    assert.equal(series.progress, 10);
    assert.ok(grouped.some((item) => item.title === 'Dune'));
});

test('groupOnTheWayDownloads collapses multiple seasons of one series', () => {
    const grouped = groupOnTheWayDownloads([
        {
            id: 'Sonarr-1',
            type: 'tv',
            service: 'Sonarr',
            title: 'True Blood',
            seriesId: 42,
            seasonNumber: 1,
            episodeNumber: 1,
            progress: 0,
            phase: 'Waiting',
            acquisitionKind: 'new',
            total: 100,
            downloaded: 0,
        },
        {
            id: 'Sonarr-2',
            type: 'tv',
            service: 'Sonarr',
            title: 'True Blood',
            seriesId: 42,
            seasonNumber: 7,
            episodeNumber: 3,
            progress: 20,
            phase: 'Downloading',
            acquisitionKind: 'upgrade',
            total: 100,
            downloaded: 20,
        },
        {
            id: 'Sonarr-3',
            type: 'tv',
            service: 'Sonarr',
            title: 'True Blood',
            seriesId: 42,
            seasonNumber: 4,
            episodeNumber: 2,
            progress: 0,
            phase: 'Waiting',
            acquisitionKind: 'new',
            total: 100,
            downloaded: 0,
        },
    ]);

    assert.equal(grouped.length, 1);
    assert.equal(grouped[0].title, 'True Blood');
    assert.equal(grouped[0].subtitle, 'Seasons 1–7 · 3 episodes');
    assert.equal(grouped[0].seasonCount, 3);
    assert.equal(grouped[0].episodeCount, 3);
    assert.equal(grouped[0].acquisitionLabel, 'Upgrade');
    assert.equal(grouped[0].phase, 'Waiting');
    assert.equal(grouped[0].progress, (20 / 300) * 100);
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
