const textBlob = (...parts) => parts.filter(Boolean).join(' ').toLowerCase();

export const extractMediaFlags = (file = {}, release = null) => {
    const mediaInfo = file?.mediaInfo || release?.mediaInfo || {};
    const blob = textBlob(
        mediaInfo.videoCodec,
        mediaInfo.videoDynamicRangeType,
        mediaInfo.videoDynamicRange,
        mediaInfo.audioCodec,
        mediaInfo.audioLanguages,
        mediaInfo.videoBitDepth,
        file?.quality?.quality?.name,
        release?.title,
        release?.releaseTitle,
        ...(Array.isArray(file?.customFormats) ? file.customFormats.map((cf) => cf?.name) : []),
        ...(Array.isArray(release?.customFormats) ? release.customFormats.map((cf) => cf?.name) : []),
    );

    const hasDolbyVision = /\bdolby[ ._-]?vision\b|\bdv\b|dovi/.test(blob);
    const hasHdr = hasDolbyVision || /\bhdr10?\+?\b|\bhlg\b/.test(blob);
    const hasAtmos = /\batmos\b|truehd[ ._-]?atmos/.test(blob);
    const hasTrueHd = /\btruehd\b/.test(blob);
    const isRemux = /\bremux\b/.test(blob);
    const codec = String(mediaInfo.videoCodec || file?.mediaInfo?.videoCodec || '').trim();
    const isHevc = /hevc|h\.?265|x265/i.test(codec || blob);

    return {
        videoCodec: codec,
        isHevc,
        hasHdr,
        hasDolbyVision,
        hasAtmos,
        hasTrueHd,
        isRemux,
    };
};

export const DEFAULT_PORTAL_BOOSTS = {
    dolbyVisionHdr: 50,
    atmos: 25,
    remux: 40,
    seasonPack: 30,
};

export const resolvePortalBoosts = (config = {}) => {
    const weights = config.upgraderPreferenceWeights && typeof config.upgraderPreferenceWeights === 'object'
        ? config.upgraderPreferenceWeights
        : {};
    const enabled = config.upgraderPreferences && typeof config.upgraderPreferences === 'object'
        ? config.upgraderPreferences
        : {};
    const on = (key, fallback = true) => enabled[key] !== undefined ? !!enabled[key] : fallback;
    return {
        preferDolbyVisionHdr: on('preferDolbyVisionHdr', true),
        preferAtmos: on('preferAtmos', true),
        preferRemux: on('preferRemux', true),
        preferSeasonPacks: on('preferSeasonPacks', true),
        weights: {
            dolbyVisionHdr: Number(weights.dolbyVisionHdr ?? DEFAULT_PORTAL_BOOSTS.dolbyVisionHdr) || 0,
            atmos: Number(weights.atmos ?? DEFAULT_PORTAL_BOOSTS.atmos) || 0,
            remux: Number(weights.remux ?? DEFAULT_PORTAL_BOOSTS.remux) || 0,
            seasonPack: Number(weights.seasonPack ?? DEFAULT_PORTAL_BOOSTS.seasonPack) || 0,
        },
    };
};

export const portalBoostScore = (flags = {}, { fullSeason = false } = {}, config = {}) => {
    const prefs = resolvePortalBoosts(config);
    let boost = 0;
    const reasons = [];
    if (prefs.preferDolbyVisionHdr && flags.hasDolbyVision && flags.hasHdr) {
        boost += prefs.weights.dolbyVisionHdr;
        reasons.push('DV+HDR');
    } else if (prefs.preferDolbyVisionHdr && flags.hasDolbyVision) {
        boost += Math.round(prefs.weights.dolbyVisionHdr * 0.8);
        reasons.push('Dolby Vision');
    }
    if (prefs.preferAtmos && (flags.hasAtmos || flags.hasTrueHd)) {
        boost += prefs.weights.atmos;
        reasons.push(flags.hasAtmos ? 'Atmos' : 'TrueHD');
    }
    if (prefs.preferRemux && flags.isRemux) {
        boost += prefs.weights.remux;
        reasons.push('Remux');
    }
    if (prefs.preferSeasonPacks && fullSeason) {
        boost += prefs.weights.seasonPack;
        reasons.push('Season pack');
    }
    return { boost, reasons };
};
