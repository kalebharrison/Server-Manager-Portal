import path from 'node:path';

import { createBoundedBufferCache } from '../cache/bounded-buffer-cache.js';
import { imageCacheMaxBytes } from '../http/image-cache-limit.js';
import { readImageResponse } from '../http/image-response.js';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_CACHE_BYTES = imageCacheMaxBytes(64);
const ALLOWED_PATHS = ['/library/metadata/', '/library/collections/', '/library/sections/', '/accounts/', '/:/resources/'];

const normalizePath = (value) => {
    const raw = String(value || '');
    if (
        !raw
        || raw.includes('\0')
        || raw.includes('\\')
        || raw.includes('?')
        || raw.includes('#')
        || raw.includes('://')
        || /%2e/i.test(raw)
        || /%5c/i.test(raw)
    ) {
        throw new Error('Invalid Plex image path');
    }
    const normalized = path.posix.normalize(raw);
    if (
        normalized !== raw
        || normalized.includes('..')
        || !ALLOWED_PATHS.some((prefix) => normalized.startsWith(prefix))
    ) {
        throw new Error('Invalid Plex image path');
    }
    return normalized;
};

const dimension = (value, fallback, max) => Math.min(max, Math.max(32, Number.parseInt(value, 10) || fallback));

export const createPlexImageService = ({ fetchWithTimeout }) => {
    const cache = createBoundedBufferCache({ maxBytes: MAX_CACHE_BYTES });

    const request = async ({ config, uri, path, width = 300, height = 450 }) => {
        const safePath = normalizePath(path);
        const safeWidth = dimension(width, 300, 1200);
        const safeHeight = dimension(height, 450, 1600);
        const key = `${config.serverIdentifier}:${uri}:${safePath}:${safeWidth}x${safeHeight}`;
        return cache.get(key, async () => {
            const source = `${uri}/photo/:/transcode?url=${encodeURIComponent(safePath)}&width=${safeWidth}&height=${safeHeight}&minSize=1&X-Plex-Token=${encodeURIComponent(config.plexToken)}`;
            const response = await fetchWithTimeout(source, {
                headers: { Accept: 'image/avif,image/webp,image/*' },
                redirect: 'error',
                size: MAX_IMAGE_BYTES,
            }, 15000);
            return readImageResponse(response, { maxBytes: MAX_IMAGE_BYTES, source: 'Plex' });
        });
    };

    const warmRecent = async (config, uri, data) => {
        const items = [
            ...(data?.recentMovies || []).slice(0, 16),
            ...(data?.recentShows || []).slice(0, 10),
            ...(data?.recentMusic || []).slice(0, 6),
        ].filter((item) => item?.thumb);
        const queue = [...items];
        await Promise.all(Array.from({ length: Math.min(6, queue.length) }, async () => {
            while (queue.length) {
                const item = queue.shift();
                await request({
                    config,
                    uri,
                    path: item.thumb,
                    width: 300,
                    height: item.type === 'artist' ? 300 : 450,
                }).catch(() => null);
            }
        }));
    };

    return { request, warmRecent };
};
