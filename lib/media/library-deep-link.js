import { tmdbIdFromPlexMedia } from '../plex/plex-guid-utils.js';

const titlesMatch = (left, right) => String(left || '').trim().toLowerCase()
    === String(right || '').trim().toLowerCase();

export const buildPlexWatchUrl = (serverIdentifier, ratingKey) => {
    const server = String(serverIdentifier || '').trim();
    const key = String(ratingKey || '').trim().replace(/^\/library\/metadata\//, '');
    if (!server || !key) return '';
    return `https://app.plex.tv/desktop/#!/server/${server}/details?key=${encodeURIComponent(`/library/metadata/${key}`)}`;
};

export const buildJellyfinWatchUrl = (jellyfinUrl, itemId) => {
    const base = String(jellyfinUrl || '').replace(/\/+$/, '');
    const id = String(itemId || '').trim();
    if (!base || !id) return '';
    return `${base}/web/#/details?id=${encodeURIComponent(id)}`;
};

const plexJson = async (url, fetchImpl) => {
    const response = await fetchImpl(url, { headers: { Accept: 'application/json' } });
    if (!response.ok) return null;
    return response.json().catch(() => null);
};

const plexGuidLookup = async (uri, token, guid, fetchImpl) => {
    const data = await plexJson(
        `${uri}/library/all?guid=${encodeURIComponent(guid)}&includeGuids=1&X-Plex-Token=${encodeURIComponent(token)}`,
        fetchImpl,
    );
    const ratingKey = data?.MediaContainer?.Metadata?.[0]?.ratingKey;
    return ratingKey ? String(ratingKey) : null;
};

const findPlexRatingKey = async (config, uri, {
    mediaType, tmdbId, tvdbId, title, year, fetchImpl,
}) => {
    const token = String(config?.plexToken || '').trim();
    if (!uri || !token) return null;
    const wanted = (mediaType === 'tv' || mediaType === 'show') ? 'show' : 'movie';
    const id = Number(tmdbId);
    const tvdb = Number(tvdbId);

    if (Number.isFinite(id) && id > 0) {
        for (const guid of [`tmdb://${id}`, `com.plexapp.agents.themoviedb://${id}?lang=en`]) {
            const ratingKey = await plexGuidLookup(uri, token, guid, fetchImpl);
            if (ratingKey) return ratingKey;
        }
    }
    if (Number.isFinite(tvdb) && tvdb > 0) {
        for (const guid of [`tvdb://${tvdb}`, `com.plexapp.agents.thetvdb://${tvdb}?lang=en`]) {
            const ratingKey = await plexGuidLookup(uri, token, guid, fetchImpl);
            if (ratingKey) return ratingKey;
        }
    }

    const query = String(title || '').trim();
    if (!query) return null;
    const data = await plexJson(
        `${uri}/hubs/search?query=${encodeURIComponent(query)}&limit=12&includeGuids=1&X-Plex-Token=${encodeURIComponent(token)}`,
        fetchImpl,
    );
    const hubs = Array.isArray(data?.MediaContainer?.Hub) ? data.MediaContainer.Hub : [];
    const candidates = hubs.flatMap((hub) => (Array.isArray(hub?.Metadata) ? hub.Metadata : []));
    const typed = candidates.filter((meta) => meta?.type === wanted);
    const tmdbHit = typed.find((meta) => tmdbIdFromPlexMedia(meta) === id);
    if (tmdbHit?.ratingKey) return String(tmdbHit.ratingKey);
    const yearHit = typed.find((meta) => (
        titlesMatch(meta.title, query)
        && (!year || Number(meta.year) === Number(year))
    ));
    if (yearHit?.ratingKey) return String(yearHit.ratingKey);
    return typed.find((meta) => titlesMatch(meta.title, query))?.ratingKey
        ? String(typed.find((meta) => titlesMatch(meta.title, query)).ratingKey)
        : null;
};

const findJellyfinItemId = async (config, {
    mediaType, tmdbId, tvdbId, title, year, fetchImpl, resolveUrl,
}) => {
    const apiKey = String(config?.jellyfinApiKey || '').trim();
    const base = String(await resolveUrl(config?.jellyfinUrl || '') || '').replace(/\/+$/, '');
    if (!apiKey || !base) return null;
    const include = (mediaType === 'tv' || mediaType === 'show') ? 'Series' : 'Movie';
    const headers = {
        Accept: 'application/json',
        'X-Emby-Token': apiKey,
    };
    const fetchItems = async (params) => {
        const response = await fetchImpl(`${base}/Items?${params.toString()}`, { headers });
        if (!response.ok) return [];
        const data = await response.json().catch(() => ({}));
        return Array.isArray(data?.Items) ? data.Items : [];
    };

    const id = Number(tmdbId);
    const tvdb = Number(tvdbId);
    const providerLookups = [];
    if (Number.isFinite(id) && id > 0) providerLookups.push(`Tmdb.${id}`);
    if (Number.isFinite(tvdb) && tvdb > 0) providerLookups.push(`Tvdb.${tvdb}`);
    for (const provider of providerLookups) {
        const params = new URLSearchParams({
            Recursive: 'true',
            IncludeItemTypes: include,
            AnyProviderIdEquals: provider,
            Limit: '1',
            Fields: 'ProviderIds',
        });
        const hit = (await fetchItems(params))[0];
        if (hit?.Id) return String(hit.Id);
    }

    const query = String(title || '').trim();
    if (!query) return null;
    const params = new URLSearchParams({
        Recursive: 'true',
        IncludeItemTypes: include,
        SearchTerm: query,
        Limit: '8',
        Fields: 'ProviderIds,ProductionYear',
    });
    const items = await fetchItems(params);
    const tmdbHit = items.find((item) => Number(item?.ProviderIds?.Tmdb) === id);
    if (tmdbHit?.Id) return String(tmdbHit.Id);
    const named = items.find((item) => (
        titlesMatch(item.Name, query)
        && (!year || Number(item.ProductionYear) === Number(year))
    )) || items.find((item) => titlesMatch(item.Name, query));
    return named?.Id ? String(named.Id) : null;
};

export const createLibraryDeepLinkResolver = ({
    fetchImpl = fetch,
    getPlexConnectionUri = async () => null,
    resolveIntegrationUrlForFetch = async (url) => url,
} = {}) => {
    const resolve = async (config = {}, query = {}) => {
        const mediaType = query.mediaType === 'tv' || query.mediaType === 'show' ? 'tv' : 'movie';
        const links = [];
        const primary = String(config.mediaServerType || 'plex').toLowerCase();
        const wantPlex = primary === 'plex' || !!(config.plexToken && config.serverIdentifier);
        const wantJellyfin = primary === 'jellyfin' || !!(config.jellyfinUrl && config.jellyfinApiKey);

        if (wantPlex) {
            try {
                const uri = await getPlexConnectionUri(config);
                const ratingKey = await findPlexRatingKey(config, uri, {
                    ...query,
                    mediaType,
                    fetchImpl,
                });
                const url = buildPlexWatchUrl(config.serverIdentifier, ratingKey);
                if (url) links.push({ label: 'Plex', url });
            } catch {
                // ignore lookup misses
            }
        }

        if (wantJellyfin) {
            try {
                const itemId = await findJellyfinItemId(config, {
                    ...query,
                    mediaType,
                    fetchImpl,
                    resolveUrl: resolveIntegrationUrlForFetch,
                });
                const url = buildJellyfinWatchUrl(config.jellyfinUrl, itemId);
                if (url) links.push({ label: 'Jellyfin', url });
            } catch {
                // ignore lookup misses
            }
        }

        return links;
    };

    return { resolve };
};
