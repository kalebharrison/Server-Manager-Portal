/** Extract a TMDB numeric id from Plex metadata Guid fields. */
export const tmdbIdFromPlexMedia = (media = {}) => {
    const ids = [
        ...(Array.isArray(media?.Guid) ? media.Guid : []),
        media?.guid ? { id: media.guid } : null,
    ].filter(Boolean);
    const match = ids
        .map((entry) => String(entry.id || ''))
        .find((id) => /^tmdb:\/\/\d+$/i.test(id));
    return match ? Number(match.split('//')[1]) : null;
};
