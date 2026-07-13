const ALLOWED_HOST = 'image.tmdb.org';
const DEFAULT_MAX_BYTES = 64 * 1024 * 1024;
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
    const entries = new Map();
    const pending = new Map();
    let totalBytes = 0;

    const touch = (key, entry) => {
        entries.delete(key);
        entries.set(key, entry);
    };

    const prune = () => {
        while (totalBytes > maxBytes && entries.size) {
            const oldestKey = entries.keys().next().value;
            const oldest = entries.get(oldestKey);
            entries.delete(oldestKey);
            totalBytes -= oldest?.body?.byteLength || 0;
        }
    };

    const load = async (remoteUrl) => {
        const key = validatedImageUrl(remoteUrl);
        const cached = entries.get(key);
        if (cached) {
            touch(key, cached);
            return cached;
        }
        if (pending.has(key)) return pending.get(key);

        const request = (async () => {
            const response = await fetchWithTimeout(key, {
                headers: { Accept: 'image/avif,image/webp,image/*' },
                redirect: 'error',
                size: maxImageBytes,
            }, 12000);
            if (!response.ok) throw new Error(`Poster source returned HTTP ${response.status}`);
            const contentType = String(response.headers?.get?.('content-type') || '').split(';')[0].trim().toLowerCase();
            if (!contentType.startsWith('image/')) throw new Error('Poster source returned non-image content');
            const declaredBytes = Number(response.headers?.get?.('content-length'));
            if (Number.isFinite(declaredBytes) && declaredBytes > maxImageBytes) throw new Error('Poster is too large');
            const body = Buffer.from(await response.arrayBuffer());
            if (!body.length || body.length > maxImageBytes) throw new Error('Poster is empty or too large');
            const entry = { body, contentType };
            entries.set(key, entry);
            totalBytes += body.byteLength;
            prune();
            return entry;
        })().finally(() => pending.delete(key));

        pending.set(key, request);
        return request;
    };

    const warm = async (urls, concurrency = 6) => {
        const queue = [...new Set((urls || []).filter(Boolean))];
        const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
            while (queue.length) {
                const url = queue.shift();
                await load(url).catch(() => null);
            }
        });
        await Promise.all(workers);
    };

    return { load, warm };
};
