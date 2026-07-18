const parseMb = (value, fallback) => {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(8, Math.min(512, parsed));
};

/** Bounded image-proxy cache size in bytes. Override with IMAGE_CACHE_MAX_MB. */
export const imageCacheMaxBytes = (fallbackMb = 64) => (
    parseMb(process.env.IMAGE_CACHE_MAX_MB, fallbackMb) * 1024 * 1024
);
