/** Fire-and-forget browser decode of poster URLs so rails paint from cache. */
export const prefetchImages = (urls: Array<string | null | undefined>, limit = 24) => {
    if (typeof window === 'undefined') return;
    const seen = new Set<string>();
    let count = 0;
    for (const raw of urls) {
        const url = String(raw || '').trim();
        if (!url || seen.has(url)) continue;
        seen.add(url);
        const img = new Image();
        img.decoding = 'async';
        img.src = url;
        count += 1;
        if (count >= limit) break;
    }
};
