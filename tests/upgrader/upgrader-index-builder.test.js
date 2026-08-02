import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRadarrIndexItem } from '../../lib/upgrader/upgrader-index-builder.js';
import { calculateCustomFormatScore, resolveCustomFormatScore } from '../../lib/upgrader/upgrader-quality.js';

const instance = { id: 'radarr-1', name: 'Radarr', url: 'http://radarr.local', type: 'radarr' };

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
        movieFile: {
            size: 10_000_000_000,
            customFormatScore: 0,
            customFormats: [{ id: 10, name: 'Remux' }, { id: 20, name: 'DV' }, { id: 30, name: 'Atmos' }],
            quality: { quality: { name: 'Remux-2160p', resolution: 2160 } },
            mediaInfo: { videoCodec: 'HEVC', videoDynamicRangeType: 'Dolby Vision', audioCodec: 'TrueHD Atmos' },
        },
    };

    const item = buildRadarrIndexItem(instance, record, null, profile);
    assert.equal(item.customFormatScore, 1600);
    assert.equal(item.avgCustomFormatScore, 1600);
    assert.equal(item.videoResolution, '4k');
    assert.equal(item.sourceTier, 'remux');
});
