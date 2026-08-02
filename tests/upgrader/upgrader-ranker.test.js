import test from 'node:test';
import assert from 'node:assert/strict';

import {
    compareQualityTier,
    isQualityTierDowngrade,
    parseResolutionTier,
    parseSourceTier,
} from '../../lib/upgrader/upgrader-quality.js';
import { rankUpgradeReleases } from '../../lib/upgrader/upgrader-ranker.js';

test('parseResolutionTier and source tiers', () => {
    assert.equal(parseResolutionTier('2160p BluRay REMUX'), '4k');
    assert.equal(parseResolutionTier('1080p'), '1080p');
    assert.equal(parseSourceTier('Bluray-1080p REMUX'), 'remux');
    assert.equal(parseSourceTier('WEBDL-2160p'), 'webdl');
});

test('quality tier compare blocks resolution downgrades', () => {
    assert.ok(compareQualityTier({ resolution: '4k', source: 'webdl' }, { resolution: '1080p', source: 'remux' }) > 0);
    assert.equal(isQualityTierDowngrade(
        { resolution: '4k', source: 'webdl' },
        { resolution: '1080p', source: 'remux' },
    ), true);
    assert.equal(isQualityTierDowngrade(
        { resolution: '1080p', source: 'webdl' },
        { resolution: '1080p', source: 'remux' },
    ), false);
});

test('season pack cannot win when it downgrades season floor resolution', () => {
    const ranked = rankUpgradeReleases(
        {
            title: 'Show',
            seasonFloorResolution: '4k',
            sourceTier: 'webdl',
            customFormatScore: 100,
            hasHdr: true,
        },
        [
            {
                title: 'Show.S01.1080p.BluRay.REMUX.COMPLETE',
                fullSeason: true,
                customFormatScore: 5000,
                rejected: false,
                downloadAllowed: true,
                quality: { quality: { name: 'Remux-1080p', resolution: 1080 } },
            },
        ],
        { upgraderMinScoreDelta: 10, upgraderPreferences: { preferSeasonPacks: true } },
    );
    assert.equal(ranked.winner, null);
    assert.match(ranked.results[0].reason, /downgrade/i);
});

test('higher score release wins when tier is equal or better', () => {
    const ranked = rankUpgradeReleases(
        {
            title: 'Movie',
            videoResolution: '4k',
            sourceTier: 'webdl',
            customFormatScore: 50,
            hasHdr: false,
        },
        [
            {
                title: 'Movie.2160p.BluRay.REMUX.Atmos.DV.HDR',
                customFormatScore: 200,
                rejected: false,
                downloadAllowed: true,
                quality: { quality: { name: 'Remux-2160p', resolution: 2160 } },
            },
        ],
        {
            upgraderMinScoreDelta: 10,
            upgraderPreferences: {
                preferDolbyVisionHdr: true,
                preferAtmos: true,
                preferRemux: true,
            },
        },
    );
    assert.ok(ranked.winner);
    assert.ok(ranked.winner.scored.totalScore > ranked.currentScored.totalScore);
    assert.ok(ranked.winner.scored.reasons.includes('Remux'));
});

test('season pack preferred over episodic when both pass floors', () => {
    const ranked = rankUpgradeReleases(
        {
            title: 'Show',
            seasonFloorResolution: '1080p',
            sourceTier: 'webdl',
            customFormatScore: 10,
        },
        [
            {
                title: 'Show.S01E01.1080p.BluRay.REMUX',
                customFormatScore: 100,
                rejected: false,
                downloadAllowed: true,
                quality: { quality: { name: 'Remux-1080p', resolution: 1080 } },
            },
            {
                title: 'Show.S01.1080p.BluRay.REMUX.COMPLETE',
                fullSeason: true,
                customFormatScore: 90,
                rejected: false,
                downloadAllowed: true,
                quality: { quality: { name: 'Remux-1080p', resolution: 1080 } },
            },
        ],
        {
            upgraderMinScoreDelta: 10,
            upgraderPreferences: { preferSeasonPacks: true, preferRemux: true },
        },
    );
    assert.ok(ranked.winner);
    assert.equal(ranked.winner.fullSeason, true);
});
