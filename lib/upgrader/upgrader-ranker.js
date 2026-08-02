import {
    extractQualityFromRelease,
    isQualityTierDowngrade,
    parseResolutionTier,
} from './upgrader-quality.js';
import { extractMediaFlags, portalBoostScore } from './upgrader-media-flags.js';

export const totalScoreFor = (customFormatScore, flags, { fullSeason = false } = {}, config = {}) => {
    const { boost, reasons } = portalBoostScore(flags, { fullSeason }, config);
    return {
        baseScore: Number(customFormatScore) || 0,
        boost,
        totalScore: (Number(customFormatScore) || 0) + boost,
        reasons,
    };
};

/**
 * Rank Arr interactive-search releases against the current on-disk snapshot.
 * Hard-blocks resolution/source downgrades (season packs cannot beat 4K with 1080p).
 */
export const rankUpgradeReleases = (current, releases = [], config = {}, options = {}) => {
    const minScoreDelta = Math.max(0, Number(config.upgraderMinScoreDelta ?? 10) || 0);
    const preferSeasonPacks = options.preferSeasonPacks !== false
        && (config.upgraderPreferences?.preferSeasonPacks !== false);

    const currentTier = {
        resolution: parseResolutionTier(
            current.seasonFloorResolution || current.videoResolution || current.resolution || 'unknown',
        ),
        source: current.sourceTier || current.source || 'unknown',
    };

    const currentFlags = {
        hasHdr: !!current.hasHdr,
        hasDolbyVision: !!current.hasDolbyVision,
        hasAtmos: !!current.hasAtmos,
        hasTrueHd: !!current.hasTrueHd,
        isRemux: !!current.isRemux || current.sourceTier === 'remux',
    };
    const currentScored = totalScoreFor(
        current.customFormatScore ?? current.avgCustomFormatScore ?? 0,
        currentFlags,
        {},
        config,
    );

    const evaluated = [];
    for (const release of (Array.isArray(releases) ? releases : [])) {
        if (release?.rejected === true || release?.downloadAllowed === false) {
            evaluated.push({
                release,
                success: false,
                reason: release?.rejections?.[0] || 'Release rejected by Arr',
            });
            continue;
        }

        const quality = extractQualityFromRelease(release);
        const flags = extractMediaFlags({}, release);
        if (quality.source === 'remux') flags.isRemux = true;

        if (isQualityTierDowngrade(currentTier, quality)) {
            evaluated.push({
                release,
                success: false,
                reason: `Quality tier downgrade blocked (${quality.resolution}/${quality.source} < ${currentTier.resolution}/${currentTier.source})`,
                quality,
                fullSeason: quality.fullSeason,
            });
            continue;
        }

        const scored = totalScoreFor(quality.customFormatScore, flags, { fullSeason: quality.fullSeason }, config);
        const delta = scored.totalScore - currentScored.totalScore;
        if (delta < minScoreDelta) {
            evaluated.push({
                release,
                success: false,
                reason: `Score delta ${delta} below minimum ${minScoreDelta}`,
                quality,
                scored,
                currentScored,
                fullSeason: quality.fullSeason,
            });
            continue;
        }

        evaluated.push({
            release,
            success: true,
            quality,
            scored,
            currentScored,
            delta,
            fullSeason: quality.fullSeason,
            flags,
        });
    }

    const winners = evaluated.filter((entry) => entry.success);
    winners.sort((a, b) => {
        if (preferSeasonPacks && a.fullSeason !== b.fullSeason) {
            return a.fullSeason ? -1 : 1;
        }
        if (b.scored.totalScore !== a.scored.totalScore) {
            return b.scored.totalScore - a.scored.totalScore;
        }
        return 0;
    });

    return {
        currentScored,
        currentTier,
        minScoreDelta,
        results: evaluated,
        winner: winners[0] || null,
        winners,
    };
};
