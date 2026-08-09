import {
    extractQualityFromRelease,
    hasLosslessRemuxAudio,
    isFakeRemuxRelease,
    isQualityTierDowngrade,
    parseResolutionTier,
    REMUX_UPGRADE_MIN_CF,
} from './upgrader-quality.js';
import { extractMediaFlags, portalBoostScore } from './upgrader-media-flags.js';

const numericScore = (value) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
};

export const totalScoreFor = (customFormatScore, flags, { fullSeason = false } = {}, config = {}) => {
    const { boost, reasons } = portalBoostScore(flags, { fullSeason }, config);
    const baseScore = numericScore(customFormatScore);
    return {
        baseScore,
        boost,
        totalScore: baseScore + boost,
        reasons,
    };
};

const importFloorFor = (quality, {
    avgScore,
    maxScore,
    episodes = [],
} = {}) => {
    if (quality.fullSeason) return maxScore;
    const wanted = new Set((quality.episodeNumbers || []).map(Number).filter(Number.isFinite));
    if (!wanted.size || !episodes.length) return maxScore;
    const matched = episodes.filter((episode) => wanted.has(Number(episode.episodeNumber)));
    if (!matched.length) return maxScore;
    return Math.max(...matched.map((episode) => numericScore(episode.customFormatScore)));
};

/**
 * Rank Arr interactive-search releases against the current on-disk snapshot.
 * Hard-blocks resolution/source downgrades (season packs cannot beat 4K with 1080p).
 *
 * Hunt target is season average (or the movie's CF). Packs must also beat the
 * best existing file or Sonarr will refuse the import; episodic grabs compare
 * to that episode so mixed seasons can still lift the average.
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
    const avgScore = numericScore(
        current.avgCustomFormatScore ?? current.customFormatScore ?? 0,
    );
    const maxScore = numericScore(
        current.maxCustomFormatScore ?? current.customFormatScore ?? avgScore,
    );
    const episodes = Array.isArray(current.episodes) ? current.episodes : [];
    const currentScored = totalScoreFor(
        avgScore,
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

        if (isFakeRemuxRelease({
            title: release?.title || release?.releaseTitle || quality.qualityName,
            qualityName: quality.qualityName,
        })) {
            evaluated.push({
                release,
                success: false,
                reason: 'Fake remux (mp4 or lossy audio)',
                quality,
                fullSeason: quality.fullSeason,
            });
            continue;
        }

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
        const remuxToRemux = currentFlags.isRemux && quality.source === 'remux';
        const losslessAudio = flags.hasTrueHd
            || flags.hasAtmos
            || hasLosslessRemuxAudio(release?.title || release?.releaseTitle || '');
        if (remuxToRemux && scored.baseScore < REMUX_UPGRADE_MIN_CF && !losslessAudio) {
            evaluated.push({
                release,
                success: false,
                reason: `Remux upgrade below CF ${REMUX_UPGRADE_MIN_CF}`,
                quality,
                scored,
                currentScored,
                fullSeason: quality.fullSeason,
            });
            continue;
        }
        const huntDelta = scored.baseScore - avgScore;
        // Sonarr/Radarr import on Arr CF only. Portal boosts may rank valid upgrades.
        if (huntDelta < minScoreDelta) {
            evaluated.push({
                release,
                success: false,
                reason: `Arr CF delta ${huntDelta} below minimum ${minScoreDelta}`,
                quality,
                scored,
                currentScored,
                fullSeason: quality.fullSeason,
            });
            continue;
        }

        const importFloor = importFloorFor(quality, { avgScore, maxScore, episodes });
        const importDelta = scored.baseScore - importFloor;
        if (importDelta < minScoreDelta) {
            evaluated.push({
                release,
                success: false,
                reason: quality.fullSeason
                    ? `Season pack would not import over existing CF ${importFloor}`
                    : `Would not import over existing CF ${importFloor}`,
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
            delta: huntDelta,
            importDelta,
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
