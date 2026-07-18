import { createBoundedBufferCache } from './bounded-buffer-cache.js';
import { imageCacheMaxBytes } from './image-cache-limit.js';
import { readImageResponse } from './image-response.js';

const ALLOWED_HOST = 'image.tmdb.org';
const DEFAULT_MAX_BYTES = imageCacheMaxBytes(64);
const DEFAULT_MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const validatedImageUrl = (value) => {
    const url = new URL(String(value || ''));
    if (url.protocol !== 'https:' || url.hostname !== ALLOWED_HOST || !url.pathname.startsWith('/t/p/')) {
        throw new Error('Unsupported poster source');
    }
    return url.toString();
};

export const createRequestImageCache = ({
    fetchWithTimeout,
    maxBytes = DEFAULT_MAX_BYTES,
    maxImageBytes = DEFAULT_MAX_IMAGE_BYTES,
} = {}) => {
    const cache = createBoundedBufferCache({ maxBytes });

    const fetchImage = async (key) => {
        const response = await fetchWithTimeout(key, {
            headers: { Accept: 'image/avif,image/webp,image/*' },
            redirect: 'error',
            size: maxImageBytes,
        }, 12000);
        return readImageResponse(response, { maxBytes: maxImageBytes, source: 'Poster source' });
    };

    const load = async (remoteUrl) => {
        const key = validatedImageUrl(remoteUrl);
        return cache.get(key, () => fetchImage(key));
    };

    const peek = (remoteUrl) => {
        const key = validatedImageUrl(remoteUrl);
        return { remoteUrl: key, image: cache.peek(key) };
    };

    const warm = async (urls, concurrency = 6) => {
        await cache.warm([...new Set((urls || []).filter(Boolean))].map((url) => {
            const key = validatedImageUrl(url);
            return { key, load: () => fetchImage(key) };
        }), concurrency);
    };

    return { load, peek, warm };
};
