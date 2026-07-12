import { enrichRecentItemsWithMediaTags, extractMediaDisplayTags } from './plex-media-tags.js';

const CACHE_VERSION = 1;
const REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const MAX_RECENT_ITEMS = 250;

const emptyRecentData = () => ({ recentMovies: [], recentShows: [], recentMusic: [] });

const processRecentList = (items, limit = MAX_RECENT_ITEMS) => {
    const unique = [];
    const seen = new Set();
    items.sort((a, b) => b.addedAt - a.addedAt);
    for (const item of items) {
        const key = item.ratingKey || item.title;
        if (seen.has(key)) continue;
        seen.add(key);
        unique.push(item);
        if (unique.length >= limit) break;
    }
    return unique;
};

const sliceRecentData = (data, limit) => ({
    recentMovies: (data?.recentMovies || []).slice(0, limit),
    recentShows: (data?.recentShows || []).slice(0, limit),
    recentMusic: (data?.recentMusic || []).slice(0, limit),
});

export const createPlexDashboardService = ({
    configPath,
    cachePath,
    loadFile,
    saveFile,
    getPlexConnectionUri,
    fetch,
    log = () => {},
}) => {
    let snapshot = null;
    let inFlight = null;
    let refreshTimer = null;

    const loadSnapshot = async () => {
        if (snapshot) return snapshot;
        const stored = await loadFile(cachePath, null);
        if (stored?.version === CACHE_VERSION && stored?.data) snapshot = stored;
        return snapshot;
    };

    const buildRecentData = async (config, uri) => {
        const sectionsData = await fetch(`${uri}/library/sections?X-Plex-Token=${config.plexToken}`, { headers: { Accept: 'application/json' } })
            .then((response) => response.ok ? response.json() : null);
        const sections = sectionsData?.MediaContainer?.Directory || [];
        const recentSections = sections.filter((section) => ['movie', 'show', 'artist'].includes(section.type));
        const sectionResults = await Promise.all(recentSections.map(async (section) => {
            const response = await fetch(`${uri}/library/sections/${section.key}/recentlyAdded?X-Plex-Token=${config.plexToken}&X-Plex-Container-Start=0&X-Plex-Container-Size=${MAX_RECENT_ITEMS}`, { headers: { Accept: 'application/json' } });
            return { sectionType: section.type, data: response.ok ? await response.json() : null };
        }));
        const recentMovies = [];
        const recentShows = [];
        const recentMusic = [];

        sectionResults.forEach(({ sectionType, data }) => {
            (data?.MediaContainer?.Metadata || []).forEach((media) => {
                const isMusic = sectionType === 'artist';
                const item = {
                    ratingKey: String(media.grandparentRatingKey || media.parentRatingKey || media.ratingKey || ''),
                    sourceRatingKey: String(media.ratingKey || ''),
                    title: isMusic ? (media.title || media.parentTitle || media.grandparentTitle) : (media.grandparentTitle || media.parentTitle || media.title),
                    parentTitle: isMusic ? (media.parentTitle || media.grandparentTitle || null) : undefined,
                    type: media.type,
                    year: media.year,
                    thumb: media.grandparentThumb || media.parentThumb || media.thumb,
                    addedAt: media.addedAt,
                    tags: extractMediaDisplayTags(media),
                    plexUrl: `https://app.plex.tv/desktop/#!/server/${config.serverIdentifier}/details?key=${encodeURIComponent(media.key)}`,
                };
                if (sectionType === 'movie') recentMovies.push(item);
                else if (sectionType === 'show') recentShows.push(item);
                else recentMusic.push(item);
            });
        });

        const movies = processRecentList(recentMovies);
        const shows = processRecentList(recentShows);
        const [taggedMovies, taggedShows] = await Promise.all([
            enrichRecentItemsWithMediaTags(uri, config, movies),
            enrichRecentItemsWithMediaTags(uri, config, shows),
        ]);
        return { recentMovies: taggedMovies, recentShows: taggedShows, recentMusic: processRecentList(recentMusic) };
    };

    const refresh = async ({ force = false } = {}) => {
        if (inFlight) return inFlight;
        inFlight = (async () => {
            const config = await loadFile(configPath, {});
            if (!config.plexToken || !config.serverIdentifier) return null;
            const uri = await getPlexConnectionUri(config);
            if (!uri) return null;
            const current = await loadSnapshot();
            const age = Date.now() - Number(current?.generatedAt || 0);
            if (!force && current?.serverIdentifier === config.serverIdentifier && current?.uri === uri && age < REFRESH_INTERVAL_MS) return current;
            const data = await buildRecentData(config, uri);
            snapshot = { version: CACHE_VERSION, generatedAt: Date.now(), serverIdentifier: config.serverIdentifier, uri, data };
            await saveFile(cachePath, snapshot);
            return snapshot;
        })().catch((error) => {
            log(`[DiscoverCache] Refresh failed: ${error.message}`);
            return snapshot;
        }).finally(() => {
            inFlight = null;
        });
        return inFlight;
    };

    const getRecentData = async (config, uri, limit = 100) => {
        const current = await loadSnapshot();
        const matches = current?.serverIdentifier === config.serverIdentifier && current?.uri === uri;
        if (matches) {
            if (Date.now() - Number(current.generatedAt || 0) >= REFRESH_INTERVAL_MS) void refresh({ force: true });
            return sliceRecentData(current.data, limit);
        }
        const refreshed = await refresh({ force: true });
        return sliceRecentData(refreshed?.data || emptyRecentData(), limit);
    };

    const start = async () => {
        await loadSnapshot();
        void refresh();
        if (!refreshTimer) refreshTimer = setInterval(() => void refresh({ force: true }), REFRESH_INTERVAL_MS);
    };

    return { getRecentData, refresh, start };
};
