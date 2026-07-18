import { mapWithConcurrency } from './concurrency.js';

const PLEX_METADATA_FETCH_CONCURRENCY = 4;
const mediaTagCache = new Map(); // ratingKey -> tags[]

export const normalizeVideoCodecLabel = (mediaInfo = {}, streams = []) => {
    const videoStreams = streams.filter((s) => Number(s.streamType) === 1);
    const parts = [
        ...videoStreams.flatMap((s) => [s.codec, s.displayTitle, s.extendedTitle, s.format]),
        mediaInfo.videoCodec,
        mediaInfo.videoProfile
    ];
    const hay = parts.filter(Boolean).join(' ').toLowerCase();
    if (!hay) return null;
    // Stream codec is more reliable than Media.videoCodec (AV1 is sometimes misreported as hevc).
    if (/\bav1\b|av01|dav1|\.av1\b/.test(hay)) return 'AV1';
    if (/hevc|h265|x265|hev1|h\.265/.test(hay)) return 'HEVC';
    if (/h264|x264|avc1|avc|h\.264/.test(hay)) return 'H.264';
    if (/vp9|vp09/.test(hay)) return 'VP9';
    if (/mpeg2|mpeg-2/.test(hay)) return 'MPEG-2';
    if (/mpeg4|xvid|divx/.test(hay)) return 'MPEG-4';
    const raw = String(mediaInfo.videoCodec || '').trim();
    return raw ? raw.toUpperCase() : null;
};

export const extractMediaDisplayTags = (metadata = {}) => {
    const mediaInfo = metadata?.Media?.[0] || {};
    const part = mediaInfo?.Part?.[0] || {};
    const streams = Array.isArray(part.Stream) ? part.Stream : [];
    const tags = [];

    const resolution = String(mediaInfo.videoResolution || '').toLowerCase();
    if (resolution.includes('4k') || resolution.includes('2160')) tags.push('4K');
    else if (resolution.includes('1080')) tags.push('1080p');
    else if (resolution.includes('720')) tags.push('720p');

    const codecLabel = normalizeVideoCodecLabel(mediaInfo, streams);
    if (codecLabel) tags.push(codecLabel);

    const audioStreams = streams.filter((s) => Number(s.streamType) === 2);
    const streamText = streams.map((s) => `${s.displayTitle || ''} ${s.extendedTitle || ''} ${s.colorTrc || ''} ${s.codec || ''}`).join(' ').toLowerCase();

    if (/dolby vision|\bdv\b|dvhe|dvav/.test(streamText)) tags.push('DV');
    else if (/hdr10\+|hdr10|hdr|hlg|smpte2084|bt2020/.test(streamText)) tags.push('HDR');

    if (audioStreams.some((s) => /atmos/i.test(`${s.displayTitle || ''} ${s.extendedTitle || ''}`))) tags.push('Atmos');
    else if (audioStreams.some((s) => /truehd|true-hd/i.test(`${s.codec || ''} ${s.displayTitle || ''}`))) tags.push('TrueHD');
    else if (audioStreams.some((s) => /dts.?x|dtsx/i.test(`${s.displayTitle || ''} ${s.codec || ''}`))) tags.push('DTS-X');

    return [...new Set(tags)];
};

const rememberMediaTags = (ratingKey, tags = []) => {
    const key = String(ratingKey || '');
    if (!key) return;
    mediaTagCache.set(key, [...tags]);
};

const getCachedMediaTags = (ratingKey) => {
    const tags = mediaTagCache.get(String(ratingKey || ''));
    return tags ? [...tags] : null;
};

const fetchPlexMetadataMap = async (uri, config, ratingKeys = []) => {
    const unique = [...new Set(ratingKeys.map((k) => String(k || '')).filter(Boolean))];
    const map = new Map();
    if (!unique.length) return map;

    const chunkSize = 25;
    const chunks = [];
    for (let i = 0; i < unique.length; i += chunkSize) {
        chunks.push(unique.slice(i, i + chunkSize));
    }

    await mapWithConcurrency(chunks, PLEX_METADATA_FETCH_CONCURRENCY, async (chunk) => {
        const res = await fetch(`${uri}/library/metadata/${chunk.join(',')}?X-Plex-Token=${config.plexToken}`, {
            headers: { Accept: 'application/json' }
        }).then((r) => r.json()).catch(() => null);
        const metas = res?.MediaContainer?.Metadata || [];
        for (const meta of metas) {
            map.set(String(meta.ratingKey), meta);
        }
    });
    return map;
};

export const enrichRecentItemsWithMediaTags = async (uri, config, items = []) => {
    if (!items.length) return items;

    const keysToFetch = [];
    for (const item of items) {
        const keys = [item.ratingKey, item.sourceRatingKey].filter(Boolean).map(String);
        for (const key of keys) {
            if (!getCachedMediaTags(key)) keysToFetch.push(key);
        }
    }
    const metaMap = await fetchPlexMetadataMap(uri, config, keysToFetch);

    return items.map((item) => {
        const primaryKey = item.ratingKey ? String(item.ratingKey) : '';
        const sourceKey = item.sourceRatingKey && item.sourceRatingKey !== item.ratingKey
            ? String(item.sourceRatingKey)
            : '';

        const primaryMeta = primaryKey ? metaMap.get(primaryKey) : null;
        const sourceMeta = sourceKey ? metaMap.get(sourceKey) : null;

        const primaryTags = primaryMeta
            ? extractMediaDisplayTags(primaryMeta)
            : (getCachedMediaTags(primaryKey) || [...(item.tags || [])]);
        const sourceTags = sourceMeta
            ? extractMediaDisplayTags(sourceMeta)
            : (getCachedMediaTags(sourceKey) || []);

        if (primaryMeta) rememberMediaTags(primaryKey, primaryTags);
        if (sourceMeta) rememberMediaTags(sourceKey, sourceTags);

        const tags = new Set([...primaryTags, ...sourceTags]);
        if (tags.has('AV1')) tags.delete('HEVC');
        const finalTags = [...tags];
        if (primaryKey) rememberMediaTags(primaryKey, finalTags);

        return { ...item, tags: finalTags };
    });
};
