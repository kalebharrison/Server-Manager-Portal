const TVDB_API_BASE = 'https://api4.thetvdb.com/v4';
const TOKEN_TTL_MS = 28 * 24 * 60 * 60 * 1000;
const DETAIL_TTL_MS = 12 * 60 * 60 * 1000;
const MAX_DETAIL_ENTRIES = 250;

export const createTvdbService = ({ fetchWithTimeout, log = () => {} }) => {
    let auth = { identity: '', token: '', expiresAt: 0 };
    const details = new Map();

    const credentials = (config = {}) => ({
        apiKey: String(config.tvdbApiKey || '').trim(),
        pin: String(config.tvdbPin || '').trim(),
    });

    const getToken = async (config) => {
        const { apiKey, pin } = credentials(config);
        if (!apiKey) return '';
        const identity = `${apiKey}:${pin}`;
        if (auth.identity === identity && auth.token && auth.expiresAt > Date.now()) return auth.token;
        const response = await fetchWithTimeout(`${TVDB_API_BASE}/login`, {
            method: 'POST',
            headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify({ apikey: apiKey, ...(pin ? { pin } : {}) }),
        }, 12000);
        if (!response.ok) throw new Error(`TVDB login returned HTTP ${response.status}`);
        const payload = await response.json().catch(() => ({}));
        const token = payload?.data?.token;
        if (!token) throw new Error('TVDB login did not return a token');
        auth = { identity, token, expiresAt: Date.now() + TOKEN_TTL_MS };
        return token;
    };

    const fetchSeries = async (config, tvdbId) => {
        const id = Number(tvdbId);
        if (!Number.isFinite(id) || id <= 0 || !config?.tvdbApiKey) return null;
        const cacheKey = String(id);
        const cached = details.get(cacheKey);
        if (cached?.expiresAt > Date.now()) return cached.data;
        try {
            const token = await getToken(config);
            const response = await fetchWithTimeout(`${TVDB_API_BASE}/series/${encodeURIComponent(id)}/extended`, {
                headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
            }, 12000);
            if (!response.ok) throw new Error(`TVDB series lookup returned HTTP ${response.status}`);
            const payload = await response.json().catch(() => ({}));
            const data = payload?.data || null;
            if (data) {
                while (details.size >= MAX_DETAIL_ENTRIES) details.delete(details.keys().next().value);
                details.set(cacheKey, { data, expiresAt: Date.now() + DETAIL_TTL_MS });
            }
            return data;
        } catch (error) {
            log(`[TVDB] Series enrichment failed: ${error.message}`);
            return cached?.data || null;
        }
    };

    const enrichSeries = async (config, item) => {
        if (item?.mediaType !== 'tv' || !item?.tvdbId || !config?.tvdbApiKey) return item;
        const tvdb = await fetchSeries(config, item.tvdbId);
        if (!tvdb) return item;
        const genres = Array.isArray(tvdb.genres)
            ? tvdb.genres.map((genre) => ({ id: genre.id ?? null, name: genre.name })).filter((genre) => genre.name)
            : [];
        const network = Array.isArray(tvdb.companies)
            ? tvdb.companies.find((company) => /network/i.test(String(company?.companyType?.companyTypeName || company?.type || '')))?.name
            : null;
        return {
            ...item,
            overview: item.overview || tvdb.overview || '',
            firstAirDate: item.firstAirDate || tvdb.firstAired || null,
            lastAirDate: item.lastAirDate || tvdb.lastAired || null,
            status: item.status || tvdb.status?.name || null,
            network: item.network || network || null,
            genres: item.genres?.length ? item.genres : genres,
            numberOfSeasons: item.numberOfSeasons || (Array.isArray(tvdb.seasons) ? tvdb.seasons.filter((season) => season.type?.type === 'Aired Order').length : null),
            metadataSources: [...new Set([...(item.metadataSources || ['TMDB']), 'TVDB'])],
        };
    };

    return { enrichSeries, fetchSeries };
};
