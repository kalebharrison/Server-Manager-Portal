const SONARR_CF_BASE = 'https://raw.githubusercontent.com/TRaSH-Guides/Guides/master/docs/json/sonarr/cf';
const SONARR_COLLECTION_URL = 'https://trash-guides.info/Sonarr/sonarr-collection-of-custom-formats/';

let catalogCache = null;
let catalogCachedAt = 0;
const CATALOG_TTL_MS = 6 * 60 * 60 * 1000;

const slugFromPath = (path) => String(path || '').split('/').pop()?.replace(/\.json$/i, '') || '';

export const createUpgraderTrash = ({ fetchImpl = fetch, log = () => {} } = {}) => {
    const loadCatalog = async ({ refresh = false } = {}) => {
        if (!refresh && catalogCache && (Date.now() - catalogCachedAt) < CATALOG_TTL_MS) {
            return catalogCache;
        }
        try {
            // GitHub contents API for the CF directory (public).
            const listing = await fetchImpl(
                'https://api.github.com/repos/TRaSH-Guides/Guides/contents/docs/json/sonarr/cf',
                { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'server-manager-portal' } },
            ).then((response) => (response.ok ? response.json() : null));
            const files = (Array.isArray(listing) ? listing : [])
                .filter((entry) => entry?.type === 'file' && String(entry.name || '').endsWith('.json'));

            const items = files.map((entry) => {
                const slug = slugFromPath(entry.name);
                const name = slug.replace(/[-_]/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
                return {
                    slug,
                    name,
                    trashId: slug,
                    category: 'Custom Formats',
                    defaultScore: null,
                    specCount: 0,
                    downloadUrl: entry.download_url || `${SONARR_CF_BASE}/${entry.name}`,
                };
            }).sort((a, b) => a.name.localeCompare(b.name));

            const categories = [{ name: 'Custom Formats', items }];
            catalogCache = {
                categories,
                itemCount: items.length,
                source: SONARR_COLLECTION_URL,
                itemsBySlug: Object.fromEntries(items.map((item) => [item.slug, item])),
            };
            catalogCachedAt = Date.now();
            return catalogCache;
        } catch (error) {
            log(`[upgrader] TRaSH catalog load failed: ${error.message}`);
            return {
                categories: [],
                itemCount: 0,
                source: SONARR_COLLECTION_URL,
                itemsBySlug: {},
                error: error.message,
            };
        }
    };

    const loadFormat = async (slug) => {
        const catalog = await loadCatalog();
        const meta = catalog.itemsBySlug?.[slug];
        const url = meta?.downloadUrl || `${SONARR_CF_BASE}/${encodeURIComponent(slug)}.json`;
        const format = await fetchImpl(url, {
            headers: { Accept: 'application/json', 'User-Agent': 'server-manager-portal' },
        }).then((response) => (response.ok ? response.json() : null));
        if (!format) throw new Error('TRaSH format not found');
        return { format, meta };
    };

    return { loadCatalog, loadFormat };
};
