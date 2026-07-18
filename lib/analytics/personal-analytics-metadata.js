export const enrichTopMediaMetadata = async ({
    uri,
    config,
    items,
    getCachedPlexMetadata,
    setCachedPlexMetadata,
    mediaType = 'show',
}) => {
    await Promise.all(items.map(async (item, index) => {
        if (!item.art || index === 0) {
            const metaPath = item.key.startsWith('/library/metadata/') ? item.key : `/library/metadata/${item.key}`;
            let data = getCachedPlexMetadata(metaPath);
            if (!data) {
                const metaRes = await fetch(`${uri}${metaPath}?X-Plex-Token=${config.plexToken}`, { headers: { Accept: 'application/json' } }).then((r) => r.json()).catch(() => null);
                if (metaRes?.MediaContainer?.Metadata?.[0]) {
                    data = metaRes.MediaContainer.Metadata[0];
                    setCachedPlexMetadata(metaPath, data);
                }
            }
            if (data) {
                item.art = data.art || data.grandparentArt || data.parentArt || item.art;
                if (index === 0) {
                    if (mediaType === 'show') {
                        item.summary = data.summary || data.parentSummary || data.grandparentSummary;
                        item.year = data.year || data.parentYear || data.grandparentYear;
                    } else {
                        item.summary = data.summary;
                        item.year = data.year;
                        item.tagline = data.tagline;
                    }
                }
            }
        }
    }));
    return items;
};
