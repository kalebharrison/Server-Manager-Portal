import { createLruCache } from '../cache/cache.js';
import { mapWithConcurrency } from '../core/concurrency.js';
import { audioTagFromParts } from '../portal-request/arrDisplayTags.js';

import { tmdbIdFromPlexMedia } from './plex-guid-utils.js';

const PLEX_METADATA_FETCH_CONCURRENCY = 4;
const mediaTagCache = createLruCache({ maxEntries: 4000 }); // ratingKey -> tags[]
const VIDEO_CODEC_TAGS = new Set(['AV1', 'HEVC', 'H.264', 'VP9', 'MPEG-2', 'MPEG-4']);

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
    let hasResolution = false;
    if (resolution.includes('4k') || resolution.includes('2160')) {
        tags.push('4K');
        hasResolution = true;
    } else if (resolution.includes('1080')) {
        tags.push('1080p');
        hasResolution = true;
    } else if (resolution.includes('720')) {
        tags.push('720p');
        hasResolution = true;
    }

    // Tone mapping only — skip video codec (HEVC/H.264); users don't need it.
    const streamText = streams.map((s) => `${s.displayTitle || ''} ${s.extendedTitle || ''} ${s.colorTrc || ''} ${s.codec || ''}`).join(' ').toLowerCase();
    const hasDv = /dolby vision|\bdv\b|dvhe|dvav/.test(streamText);
    const hasHdr = /hdr10\+|hdr10|\bhdr\b|hlg|smpte2084|bt2020|\bpq\b/.test(streamText);
    if (hasDv && hasHdr) tags.push('DV/HDR');
    else if (hasDv) tags.push('DV');
    else if (hasHdr) tags.push('HDR');
    else if (hasResolution) tags.push('SDR');

    const audioStreams = streams.filter((s) => Number(s.streamType) === 2);
    const audioTag = audioTagFromParts(
        mediaInfo.audioCodec,
        ...audioStreams.flatMap((s) => [s.codec, s.displayTitle, s.extendedTitle, s.audioChannelLayout]),
    );
    if (audioTag) tags.push(audioTag);

    return [...new Set(tags)];
};

const rememberMediaTags = (ratingKey, tags = []) => {
    const key = String(ratingKey || '');
    if (!key) return;
    mediaTagCache.set(key, [...tags]);
};

const getCachedMediaTags = (ratingKey) => {
    const tags = mediaTagCache.get(String(ratingKey || ''));
    return Array.isArray(tags) ? [...tags] : null;
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
        const res = await fetch(`${uri}/library/metadata/${chunk.join(',')}?includeGuids=1&X-Plex-Token=${config.plexToken}`, {
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

        const tags = new Set(
            [...primaryTags, ...sourceTags].filter((tag) => !VIDEO_CODEC_TAGS.has(String(tag))),
        );
        const finalTags = [...tags];
        if (primaryKey) rememberMediaTags(primaryKey, finalTags);

        // Prefer show/movie Guids from primary metadata (grandparent for episodes).
        const tmdbId = tmdbIdFromPlexMedia(primaryMeta)
            || tmdbIdFromPlexMedia(sourceMeta)
            || (Number.isFinite(Number(item.tmdbId)) && Number(item.tmdbId) > 0 ? Number(item.tmdbId) : null);

        const audienceRating = Number(primaryMeta?.audienceRating ?? sourceMeta?.audienceRating ?? item.audienceRating);
        const criticRating = Number(primaryMeta?.rating ?? sourceMeta?.rating ?? item.rating);
        const rating = Number.isFinite(audienceRating) && audienceRating > 0
            ? audienceRating
            : (Number.isFinite(criticRating) && criticRating > 0 ? criticRating : null);

        return {
            ...item,
            tags: finalTags,
            ...(tmdbId ? { tmdbId } : {}),
            ...(rating != null ? { rating, audienceRating: rating } : {}),
        };
    });
};
