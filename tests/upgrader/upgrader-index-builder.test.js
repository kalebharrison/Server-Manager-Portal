import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRadarrIndexItem, buildSonarrIndexItem } from '../../lib/upgrader/upgrader-index-builder.js';
import { calculateCustomFormatScore, resolveCustomFormatScore } from '../../lib/upgrader/upgrader-quality.js';

const instance = { id: 'radarr-1', name: 'Radarr', url: 'http://radarr.local', type: 'radarr' };
const sonarrInstance = { id: 'sonarr-1', name: 'Sonarr', url: 'http://sonarr.local', type: 'sonarr' };

const profile = {
    id: 1,
    name: 'Ultra-HD',
    formatItems: [
        { format: 10, score: 1000, name: 'Remux Tier 01' },
        { format: 20, score: 500, name: 'DV HDR10' },
        { format: 30, score: 100, name: 'Atmos' },
    ],
};

test('calculateCustomFormatScore sums matched profile format scores', () => {
    const total = calculateCustomFormatScore(
        [{ id: 10, name: 'Remux' }, { id: 20, name: 'DV' }, { id: 99, name: 'Ignored' }],
        profile,
    );
    assert.equal(total, 1500);
});

test('resolveCustomFormatScore prefers non-zero API score, else profile math', () => {
    assert.equal(resolveCustomFormatScore({ customFormatScore: 2750, customFormats: [] }, profile), 2750);
    assert.equal(resolveCustomFormatScore({
        customFormatScore: 0,
        customFormats: [{ id: 10 }, { id: 30 }],
    }, profile), 1100);
});

test('radarr index uses profile math when movie list score is zero', () => {
    const record = {
        id: 42,
        title: 'Example',
        year: 2020,
        titleSlug: 'example',
        hasFile: true,
        qualityProfileId: 1,
        path: '/media/movies/Example',
        movieFile: {
            size: 10_000_000_000,
            customFormatScore: 0,
            customFormats: [{ id: 10, name: 'Remux' }, { id: 20, name: 'DV' }, { id: 30, name: 'Atmos' }],
            quality: { quality: { name: 'Remux-2160p', resolution: 2160 } },
            mediaInfo: { videoCodec: 'HEVC', videoDynamicRangeType: 'Dolby Vision', audioCodec: 'TrueHD Atmos' },
        },
    };

    const item = buildRadarrIndexItem({
        ...instance,
        activeDirectory: '/media/movies',
        activeAnimeDirectory: '/media/anime.movies',
    }, record, null, profile);
    assert.equal(item.customFormatScore, 1600);
    assert.equal(item.avgCustomFormatScore, 1600);
    assert.equal(item.videoResolution, '4k');
    assert.equal(item.sourceTier, 'remux');
    assert.equal(item.libraryName, 'Movies');
    assert.equal(item.libraryKey, 'radarr:radarr-1:movies');
});

test('sonarr prefers embedded episodeFile custom format score', () => {
    const record = {
        id: 7,
        title: 'Preacher',
        year: 2016,
        titleSlug: 'preacher',
        qualityProfileId: 1,
        seasons: [{ seasonNumber: 1, statistics: { episodeFileCount: 1, sizeOnDisk: 1_000_000_000 } }],
        statistics: { episodeFileCount: 1, sizeOnDisk: 1_000_000_000 },
    };
    const episodes = [{
        id: 1,
        hasFile: true,
        episodeFileId: 99,
        seasonNumber: 1,
        episodeNumber: 1,
        title: 'Pilot',
        episodeFile: {
            id: 99,
            seasonNumber: 1,
            size: 1_000_000_000,
            customFormatScore: 1700,
            customFormats: [{ id: 10 }, { id: 20 }],
            quality: { quality: { name: 'WEBDL-1080p', resolution: 1080 } },
            mediaInfo: { videoCodec: 'HEVC' },
        },
    }];

    const item = buildSonarrIndexItem(sonarrInstance, record, [], episodes, profile);
    assert.equal(item.scoreUnknown, false);
    assert.equal(item.avgCustomFormatScore, 1700);
    assert.equal(item.customFormatScore, 1700);
    assert.equal(item.seasons[0].avgCustomFormatScore, 1700);
});

test('sonarr episode-files-only path scores without episode list', () => {
    const record = {
        id: 9,
        title: 'Frisky Dingo',
        year: 2006,
        titleSlug: 'frisky-dingo',
        qualityProfileId: 1,
        path: '/media/tv.shows/Frisky Dingo',
        seasons: [{ seasonNumber: 1, statistics: { episodeFileCount: 2, sizeOnDisk: 2_000_000_000 } }],
        statistics: { episodeFileCount: 2, sizeOnDisk: 2_000_000_000 },
    };
    const episodeFiles = [
        {
            id: 1,
            seriesId: 9,
            seasonNumber: 1,
            size: 1_000_000_000,
            customFormatScore: 1700,
            customFormats: [{ id: 10 }, { id: 20 }],
            quality: { quality: { name: 'WEBDL-1080p', resolution: 1080 } },
            mediaInfo: { videoCodec: 'HEVC' },
        },
        {
            id: 2,
            seriesId: 9,
            seasonNumber: 1,
            size: 1_000_000_000,
            customFormatScore: 1500,
            customFormats: [{ id: 10 }],
            quality: { quality: { name: 'WEBDL-1080p', resolution: 1080 } },
            mediaInfo: { videoCodec: 'HEVC' },
        },
    ];
    const item = buildSonarrIndexItem({
        ...sonarrInstance,
        activeDirectory: '/media/tv.shows',
        activeAnimeDirectory: '/media/anime.shows',
    }, record, episodeFiles, [], profile);
    assert.equal(item.scoreUnknown, false);
    assert.equal(item.avgCustomFormatScore, 1600);
    assert.equal(item.libraryName, 'Tv Shows');
    assert.equal(item.seasons[0].avgCustomFormatScore, 1600);
});

test('sonarr statistics-only fallback marks scoreUnknown instead of fake zero', () => {
    const record = {
        id: 8,
        title: 'Missing Files Show',
        year: 2006,
        titleSlug: 'missing-files-show',
        qualityProfileId: 1,
        seasons: [{ seasonNumber: 1, statistics: { episodeFileCount: 13, sizeOnDisk: 5_000_000_000 } }],
        statistics: { episodeFileCount: 13, sizeOnDisk: 5_000_000_000 },
    };
    const item = buildSonarrIndexItem(sonarrInstance, record, [], [], profile);
    assert.equal(item.hasFile, true);
    assert.equal(item.scoreUnknown, true);
    assert.equal(item.avgCustomFormatScore, null);
    assert.equal(item.seasons[0].scoreUnknown, true);
});
