const metadataPathForItem = (item) => {
    const key = String(item?.key || '').trim();
    if (!key) return null;
    return key.startsWith('/library/metadata/') ? key : `/library/metadata/${key}`;
};

export const enrichTopMediaMetadata = async ({
    uri,
    config,
    items,
    getCachedPlexMetadata,
    setCachedPlexMetadata,
    mediaType = 'show',
}) => {
    await Promise.all((Array.isArray(items) ? items : []).map(async (item, index) => {
        if (!item) return;
        const needsArt = !item.art;
        const needsThumb = !item.thumb;
        const needsHeroCopy = index === 0;
        if (!needsArt && !needsThumb && !needsHeroCopy) return;

        const metaPath = metadataPathForItem(item);
        if (!metaPath) return;

        let data = getCachedPlexMetadata(metaPath);
        if (!data) {
            const metaRes = await fetch(`${uri}${metaPath}?X-Plex-Token=${config.plexToken}`, { headers: { Accept: 'application/json' } }).then((r) => r.json()).catch(() => null);
            if (metaRes?.MediaContainer?.Metadata?.[0]) {
                data = metaRes.MediaContainer.Metadata[0];
                setCachedPlexMetadata(metaPath, data);
            }
        }
        if (!data) return;

        if (needsThumb) {
            item.thumb = data.thumb || data.grandparentThumb || data.parentThumb || item.thumb;
        }
        if (needsArt) {
            item.art = data.art || data.grandparentArt || data.parentArt || item.art;
        }
        if (needsHeroCopy) {
            if (mediaType === 'show') {
                item.summary = data.summary || data.parentSummary || data.grandparentSummary;
                item.year = data.year || data.parentYear || data.grandparentYear;
            } else {
                item.summary = data.summary;
                item.year = data.year;
                item.tagline = data.tagline;
            }
        }
    }));
    return items;
};
