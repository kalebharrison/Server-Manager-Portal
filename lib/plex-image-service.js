import { createBoundedBufferCache } from './bounded-buffer-cache.js';
import { readImageResponse } from './image-response.js';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_CACHE_BYTES = 128 * 1024 * 1024;
const ALLOWED_PATHS = ['/library/metadata/', '/library/collections/', '/library/sections/', '/accounts/', '/:/resources/'];

const normalizePath = (value) => {
    const path = String(value || '');
    if (!ALLOWED_PATHS.some((prefix) => path.startsWith(prefix)) || path.includes('?') || path.includes('#') || path.includes('://')) {
        throw new Error('Invalid Plex image path');
    }
    return path;
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
