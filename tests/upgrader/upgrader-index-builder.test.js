import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRadarrIndexItem } from '../../lib/upgrader/upgrader-index-builder.js';

const instance = { id: 'radarr-1', name: 'Radarr', url: 'http://radarr.local', type: 'radarr' };

test('radarr index prefers moviefile customFormatScore over embedded movieFile zeros', () => {
    const record = {
        id: 42,
        title: 'Example',
        year: 2020,
        titleSlug: 'example',
        hasFile: true,
        qualityProfileId: 1,
        movieFile: {
            size: 10_000_000_000,
            customFormatScore: 0,
            quality: { quality: { name: 'Remux-2160p', resolution: 2160 } },
            mediaInfo: { videoCodec: 'HEVC', videoDynamicRangeType: 'Dolby Vision' },
        },
    };
    const movieFile = {
        ...record.movieFile,
        movieId: 42,
        customFormatScore: 2750,
    };

    const fromListOnly = buildRadarrIndexItem(instance, record);
    assert.equal(fromListOnly.customFormatScore, 0);

    const withFileEndpoint = buildRadarrIndexItem(instance, record, movieFile);
    assert.equal(withFileEndpoint.customFormatScore, 2750);
    assert.equal(withFileEndpoint.avgCustomFormatScore, 2750);
    assert.equal(withFileEndpoint.videoResolution, '4k');
    assert.equal(withFileEndpoint.sourceTier, 'remux');
});
