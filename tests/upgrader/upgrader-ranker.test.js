import test from 'node:test';
import assert from 'node:assert/strict';

import {
    compareQualityTier,
    isFakeRemuxRelease,
    isQualityTierDowngrade,
    parseResolutionTier,
    parseSourceTier,
} from '../../lib/upgrader/upgrader-quality.js';
import { rankUpgradeReleases } from '../../lib/upgrader/upgrader-ranker.js';

test('fake remux helper flags mp4 UHDRemux titles', () => {
    assert.equal(isFakeRemuxRelease({
        title: 'Plane.2023.2160p.UHDRemux.HDR.DoVi-TheEqualizer.mp4',
        qualityName: 'Remux-2160p',
    }), true);
    assert.equal(isFakeRemuxRelease({
        title: 'Amsterdam.2022.BDREMUX.2160p.HDR.seleZen.mkv',
        qualityName: 'Remux-2160p',
    }), false);
    assert.equal(isFakeRemuxRelease({
        title: 'Amsterdam.2022.BDREMUX.2160p.HDR.seleZen.mkv',
        qualityName: 'Remux-2160p',
        files: ['Amsterdam.2022.BDREMUX.2160p.HDR.AC3.mkv'],
    }), true);
    assert.equal(isFakeRemuxRelease({
        title: 'Some.Movie.2160p.WEB-DL.mp4',
        qualityName: 'WEBDL-2160p',
    }), false);
});

test('hunt ranker rejects remux-tagged mp4 encodes', () => {
    const ranked = rankUpgradeReleases(
        {
            title: 'Plane',
            videoResolution: '4k',
            sourceTier: 'remux',
            customFormatScore: -10000,
            hasAtmos: true,
            hasTrueHd: true,
            isRemux: true,
        },
        [
            {
                title: 'Plane.2023.2160p.UHDRemux.HDR.DoVi-TheEqualizer.mp4',
                customFormatScore: 0,
                rejected: false,
                downloadAllowed: true,
                quality: { quality: { name: 'Remux-2160p', resolution: 2160 } },
            },
        ],
        { upgraderMinScoreDelta: 10 },
    );
    assert.equal(ranked.winner, null);
    assert.match(ranked.results[0].reason, /fake remux/i);
});

test('hunt ranker rejects remux-tagged AC3 encodes', () => {
    const ranked = rankUpgradeReleases(
        {
            title: 'Amsterdam',
            videoResolution: '4k',
            sourceTier: 'remux',
            customFormatScore: 0,
            isRemux: true,
        },
        [
            {
                title: 'Amsterdam.2022.BDREMUX.2160p.HDR.AC3.seleZen',
                customFormatScore: 0,
                rejected: false,
                downloadAllowed: true,
                quality: { quality: { name: 'Remux-2160p', resolution: 2160 } },
            },
        ],
        { upgraderMinScoreDelta: 10 },
    );
    assert.equal(ranked.winner, null);
    assert.match(ranked.results[0].reason, /fake remux/i);
});

test('remux-to-remux requires CF 2000 or lossless audio', () => {
    const lowCf = rankUpgradeReleases(
        {
            title: 'Movie',
            videoResolution: '4k',
            sourceTier: 'remux',
            customFormatScore: 0,
            isRemux: true,
        },
        [
            {
                title: 'Movie.2022.2160p.BluRay.REMUX.HDR-GROUP',
                customFormatScore: 500,
                rejected: false,
                downloadAllowed: true,
                quality: { quality: { name: 'Remux-2160p', resolution: 2160 } },
            },
        ],
        { upgraderMinScoreDelta: 10 },
    );
    assert.equal(lowCf.winner, null);
    assert.match(lowCf.results[0].reason, /below CF 2000/i);

    const atmos = rankUpgradeReleases(
        {
            title: 'Movie',
            videoResolution: '4k',
            sourceTier: 'remux',
            customFormatScore: 0,
            isRemux: true,
        },
        [
            {
                title: 'Movie.2022.2160p.BluRay.REMUX.HDR.TrueHD.Atmos-GROUP',
                customFormatScore: 5000,
                rejected: false,
                downloadAllowed: true,
                quality: { quality: { name: 'Remux-2160p', resolution: 2160 } },
            },
        ],
        { upgraderMinScoreDelta: 10 },
    );
    assert.ok(atmos.winner);
});

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

test('portal boosts cannot invent an Arr custom-format upgrade', () => {
    const ranked = rankUpgradeReleases(
        {
            title: 'Ted Lasso',
            videoResolution: '4k',
            sourceTier: 'webdl',
            customFormatScore: 1700,
            hasHdr: true,
            hasDolbyVision: true,
        },
        [
            {
                title: 'Ted.Lasso.S04E01.PROPER.HDR.2160p.WEB.h265-ETHEL',
                customFormatScore: 5,
                rejected: false,
                downloadAllowed: true,
                quality: { quality: { name: 'WEBDL-2160p', resolution: 2160 } },
            },
        ],
        {
            upgraderMinScoreDelta: 10,
            upgraderPreferences: {
                preferDolbyVisionHdr: true,
                preferAtmos: true,
                preferRemux: true,
                preferSeasonPacks: true,
            },
        },
    );
    assert.equal(ranked.winner, null);
    assert.match(ranked.results[0].reason, /Arr CF delta/i);
});

test('negative Arr CF score cannot beat a positive library file via DV boosts', () => {
    const ranked = rankUpgradeReleases(
        {
            title: 'Mindhunter',
            videoResolution: '4k',
            sourceTier: 'webdl',
            customFormatScore: 85,
            hasHdr: true,
        },
        [
            {
                title: 'Mindhunter.S02.2160p.NF.WEB-DL.DV.DDP5.1.Atmos.H.265',
                fullSeason: true,
                customFormatScore: -8215,
                rejected: false,
                downloadAllowed: true,
                quality: { quality: { name: 'WEBDL-2160p', resolution: 2160 } },
            },
        ],
        {
            upgraderMinScoreDelta: 10,
            upgraderPreferences: {
                preferDolbyVisionHdr: true,
                preferAtmos: true,
                preferSeasonPacks: true,
            },
        },
    );
    assert.equal(ranked.winner, null);
    assert.match(ranked.results[0].reason, /Arr CF delta/i);
});

test('mixed season hunts average but only grabs what Arr can import', () => {
    const current = {
        title: 'Mixed Show',
        seasonFloorResolution: '4k',
        sourceTier: 'webdl',
        customFormatScore: 633,
        avgCustomFormatScore: 633,
        maxCustomFormatScore: 1700,
        episodes: [
            { seasonNumber: 1, episodeNumber: 1, customFormatScore: 1700 },
            { seasonNumber: 1, episodeNumber: 2, customFormatScore: 100 },
            { seasonNumber: 1, episodeNumber: 3, customFormatScore: 100 },
        ],
    };
    const config = {
        upgraderMinScoreDelta: 10,
        upgraderPreferences: { preferSeasonPacks: true },
    };

    const packBlocked = rankUpgradeReleases(current, [{
        title: 'Mixed.Show.S01.2160p.WEB-DL.COMPLETE',
        fullSeason: true,
        customFormatScore: 700,
        rejected: false,
        downloadAllowed: true,
        quality: { quality: { name: 'WEBDL-2160p', resolution: 2160 } },
    }], config);
    assert.equal(packBlocked.winner, null);
    assert.match(packBlocked.results[0].reason, /would not import/i);

    const weakEpisode = rankUpgradeReleases(current, [
        {
            title: 'Mixed.Show.S01.2160p.WEB-DL.COMPLETE',
            fullSeason: true,
            customFormatScore: 700,
            rejected: false,
            downloadAllowed: true,
            quality: { quality: { name: 'WEBDL-2160p', resolution: 2160 } },
        },
        {
            title: 'Mixed.Show.S01E02.2160p.WEB-DL',
            episodeNumbers: [2],
            customFormatScore: 700,
            rejected: false,
            downloadAllowed: true,
            quality: { quality: { name: 'WEBDL-2160p', resolution: 2160 } },
        },
    ], config);
    assert.ok(weakEpisode.winner);
    assert.equal(weakEpisode.winner.fullSeason, false);
    assert.equal(weakEpisode.winner.delta, 67);

    const packWins = rankUpgradeReleases(current, [{
        title: 'Mixed.Show.S01.2160p.WEB-DL.COMPLETE',
        fullSeason: true,
        customFormatScore: 1710,
        rejected: false,
        downloadAllowed: true,
        quality: { quality: { name: 'WEBDL-2160p', resolution: 2160 } },
    }], config);
    assert.ok(packWins.winner);
    assert.equal(packWins.winner.fullSeason, true);
    assert.equal(packWins.winner.delta, 1077);
});
