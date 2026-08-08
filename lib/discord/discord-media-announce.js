/**
 * Debounced member-channel announces for post-integrity media/upgrades.
 * Groups TV by series+season so episode packs flush as one Discord post.
 */

const DEFAULT_DEBOUNCE_MINUTES = 10;
const MAX_PENDING = 200;
const MAX_RECENT = 300;
const EPISODE_LIST_CAP = 8;

const asInt = (value, fallback = null) => {
    const n = Number(value);
    return Number.isFinite(n) ? Math.trunc(n) : fallback;
};

export const buildMediaAnnounceGroupKey = (item = {}) => {
    const arrType = String(item.arrType || '').toLowerCase();
    const entityId = item.entityId ?? item.movieId ?? item.seriesId ?? item.albumId ?? null;
    if (arrType === 'sonarr' || item.mediaType === 'show') {
        const season = asInt(item.seasonNumber, 0);
        return `sonarr:${entityId ?? 'x'}:S${season}`;
    }
    if (arrType === 'lidarr' || item.mediaType === 'album') {
        return `lidarr:${entityId ?? 'x'}`;
    }
    return `radarr:${entityId ?? item.key ?? 'x'}`;
};

export const buildMediaAnnounceContentHash = (group = {}) => {
    const keys = (group.items || [])
        .map((entry) => String(entry.key || entry.episodeId || entry.movieFileId || entry.trackFileId || entry.title || ''))
        .filter(Boolean)
        .sort();
    return `${group.groupKey}|${group.isUpgrade ? 'u' : 'n'}|${keys.join(',')}`;
};

const stripToPlain = (value, max = 350) => String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);

const padEp = (n) => `E${String(n).padStart(2, '0')}`;

/** Skip release filenames / paths that Sonarr sometimes stores as episode.title. */
export const isUsableEpisodeTitle = (value) => {
    const text = String(value || '').trim();
    if (!text || text.length > 80) return false;
    if (/[\\/]/.test(text)) return false;
    if (/\.(mkv|mp4|avi|ts|m4v|mov|m2ts)$/i.test(text)) return false;
    if (/\bS\d{1,2}E\d{1,3}\b/i.test(text) && /x265|x264|hevc|aac|webrip|bluray|hdtv|remux/i.test(text)) {
        return false;
    }
    return true;
};

const newestFirst = (left, right) => String(right?.addedAt || '').localeCompare(String(left?.addedAt || ''));

const sampleMovieGroup = () => ({
    source: 'sample',
    title: 'Dune',
    year: 2021,
    overview: 'Paul Atreides travels to the most dangerous planet in the universe to ensure the future of his family and his people.',
    thumbUrl: 'https://image.tmdb.org/t/p/w500/d5NXSklXo0qyIYkgV94XAgMIckC.jpg',
    arrType: 'radarr',
    mediaType: 'movie',
    isUpgrade: false,
    items: [{ title: 'Dune', key: 'sample:movie' }],
});

const sampleShowGroup = () => ({
    source: 'sample',
    title: 'Severance',
    year: 2022,
    overview: 'Mark leads a team whose memories have been split between their work and personal lives.',
    thumbUrl: 'https://image.tmdb.org/t/p/w500/lFf6LLrQjYqM7WI4BNhut3vhvZR.jpg',
    arrType: 'sonarr',
    mediaType: 'show',
    seasonNumber: 1,
    isUpgrade: false,
    items: [
        { episodeNumber: 1, episodeTitle: 'Good News About Hell', key: 'sample:tv:1' },
        { episodeNumber: 2, episodeTitle: 'Half Loop', key: 'sample:tv:2' },
        { episodeNumber: 3, episodeTitle: 'In Perpetuity', key: 'sample:tv:3' },
    ],
});

const pickShowSeasonItems = (show = {}) => {
    const episodes = Array.isArray(show.episodes) ? show.episodes : [];
    const bySeason = new Map();
    for (const episode of episodes) {
        const seasonNumber = Number(episode?.seasonNumber);
        if (!Number.isFinite(seasonNumber) || seasonNumber <= 0) continue;
        if (!bySeason.has(seasonNumber)) bySeason.set(seasonNumber, []);
        bySeason.get(seasonNumber).push(episode);
    }
    let seasonNumber = 1;
    let rows = [];
    for (const [number, list] of bySeason) {
        if (list.length > rows.length) {
            seasonNumber = number;
            rows = list;
        }
    }
    if (!rows.length) {
        const seasons = Array.isArray(show.seasons) ? show.seasons : [];
        const season = seasons.find((entry) => Number(entry?.seasonNumber) > 0) || seasons[0];
        seasonNumber = Number(season?.seasonNumber) || 1;
        const count = Math.min(4, Math.max(2, Number(season?.episodeCount) || 2));
        rows = Array.from({ length: count }, (_, index) => ({ episodeNumber: index + 1 }));
    }
    return {
        seasonNumber,
        items: rows.slice(0, 50).map((episode, index) => ({
            episodeNumber: Number(episode.episodeNumber) || index + 1,
            episodeTitle: isUsableEpisodeTitle(episode.episodeTitle || episode.title)
                ? String(episode.episodeTitle || episode.title).trim()
                : null,
            key: episode.episodeFileId || episode.episodeId || `${show.ratingKey || show.title}:e${index}`,
        })),
    };
};

const copyIndexMeta = (item = {}) => ({
    year: item.year || null,
    overview: item.overview || '',
    thumbUrl: item.thumbUrl || item.posterUrl || null,
    tmdbId: item.tmdbId || null,
});

/** Pick one library movie + one TV season, or labeled samples if the QC index is empty. */
export const pickTestMediaAnnounceGroups = (index = {}) => {
    const items = Array.isArray(index.items) ? index.items : [];
    const movie = [...items]
        .filter((item) => item?.mediaType === 'movie' && item.hasFile && item.title)
        .sort(newestFirst)[0];
    const show = [...items]
        .filter((item) => (
            (item?.mediaType === 'show' || item?.arrType === 'sonarr')
            && item.hasFile
            && item.title
        ))
        .sort(newestFirst)[0];

    const movieGroup = movie
        ? {
            source: 'library',
            title: movie.title,
            arrType: 'radarr',
            mediaType: 'movie',
            entityId: movie.entityId ?? null,
            isUpgrade: false,
            ...copyIndexMeta(movie),
            items: [{ title: movie.title, key: movie.ratingKey || `movie:${movie.entityId}` }],
        }
        : sampleMovieGroup();

    let showGroup = sampleShowGroup();
    if (show) {
        const season = pickShowSeasonItems(show);
        showGroup = {
            source: 'library',
            title: show.title,
            arrType: 'sonarr',
            mediaType: 'show',
            entityId: show.entityId ?? null,
            seasonNumber: season.seasonNumber,
            isUpgrade: false,
            ...copyIndexMeta(show),
            items: season.items,
        };
    }

    return [movieGroup, showGroup];
};

export const enrichAnnounceGroupFromIndex = (group = {}, index = {}) => {
    if (group.thumbUrl && group.overview && group.year) return group;
    const items = Array.isArray(index.items) ? index.items : [];
    const match = items.find((item) => {
        if (!item?.title) return false;
        if (group.entityId != null && item.entityId != null
            && String(item.entityId) === String(group.entityId)
            && String(item.arrType || '') === String(group.arrType || '')) return true;
        const key = String(group.items?.[0]?.key || group.groupKey || '');
        if (item.ratingKey && key.startsWith(String(item.ratingKey))) return true;
        return item.title === group.title && String(item.arrType || '') === String(group.arrType || '');
    });
    if (!match) return group;
    return {
        ...group,
        year: group.year || match.year || null,
        overview: group.overview || match.overview || '',
        thumbUrl: group.thumbUrl || match.thumbUrl || null,
        tmdbId: group.tmdbId || match.tmdbId || null,
    };
};

const episodeFieldValue = (items = []) => {
    const numbers = items
        .map((entry) => asInt(entry.episodeNumber, null))
        .filter((n) => n != null)
        .sort((a, b) => a - b);
    const titled = items
        .map((entry) => {
            const ep = asInt(entry.episodeNumber, null);
            if (ep == null || !isUsableEpisodeTitle(entry.episodeTitle)) return null;
            return `${padEp(ep)} — ${String(entry.episodeTitle).trim()}`;
        })
        .filter(Boolean);
    const uniqueTitled = [...new Set(titled)];
    if (uniqueTitled.length && uniqueTitled.length >= Math.min(items.length, 2)
        && uniqueTitled.length <= EPISODE_LIST_CAP) {
        return uniqueTitled.join('\n').slice(0, 1000);
    }
    if (uniqueTitled.length > EPISODE_LIST_CAP) {
        return `${uniqueTitled.slice(0, EPISODE_LIST_CAP).join('\n')}\n…and ${uniqueTitled.length - EPISODE_LIST_CAP} more`;
    }
    if (!numbers.length) return null;
    const first = numbers[0];
    const last = numbers[numbers.length - 1];
    const range = first === last ? padEp(first) : `${padEp(first)}–${padEp(last)}`;
    return numbers.length > 1 ? `${range} · ${numbers.length} episodes` : range;
};

export const buildMediaAnnounceEmbed = (group = {}, { isTest = false } = {}) => {
    const items = Array.isArray(group.items) ? group.items : [];
    const name = String(group.title || items[0]?.title || 'Media').trim() || 'Media';
    const year = asInt(group.year, null);
    const isUpgrade = !!group.isUpgrade;
    const kind = String(group.arrType || items[0]?.arrType || '').toLowerCase();
    const isShow = kind === 'sonarr' || group.mediaType === 'show';
    const isAlbum = kind === 'lidarr' || group.mediaType === 'album';
    const overview = stripToPlain(group.overview, 280);
    const season = asInt(group.seasonNumber ?? items[0]?.seasonNumber, null);
    const title = year ? `${name} (${year})` : name;

    let headline = isUpgrade ? 'Quality upgrade is on the server.' : 'Now on the server.';
    if (isShow) {
        headline = season != null
            ? (isUpgrade
                ? `Season ${season} was upgraded.`
                : `Season ${season} is on the server.`)
            : (isUpgrade ? 'Episodes were upgraded.' : 'New episodes are on the server.');
    } else if (isAlbum) {
        headline = isUpgrade ? 'Album upgrade is on the server.' : 'Album is on the server.';
    }

    const fields = [
        { name: 'Status', value: isUpgrade ? 'Upgraded' : 'Now available', inline: true },
        { name: 'Type', value: isShow ? 'TV' : (isAlbum ? 'Music' : 'Movie'), inline: true },
    ];
    if (isShow) {
        const episodeValue = episodeFieldValue(items);
        if (episodeValue) fields.push({ name: 'Episodes', value: episodeValue, inline: false });
    }

    return {
        title: title.slice(0, 256),
        description: [overview, headline].filter(Boolean).join('\n\n'),
        fields,
        thumbnail: group.thumbUrl || null,
        color: isUpgrade ? 0xa855f7 : 0x22c55e,
        footer: isTest ? 'Test preview — not a new import' : undefined,
    };
};

export const createDiscordMediaAnnounce = ({
    loadPrefs,
    savePrefs,
    getDiscordNotifier = () => null,
    loadIndex = null,
    log = () => {},
} = {}) => {
    const debounceMs = (config) => {
        const minutes = Math.max(1, Number(config?.discordMediaAnnounceDebounceMinutes) || DEFAULT_DEBOUNCE_MINUTES);
        return minutes * 60 * 1000;
    };

    const enqueue = async (config, item = {}) => {
        if (!config?.discordEnabled) return false;
        if (config.discordNotifyMediaReady === false) return false;
        if (!config.discordWebhookUrl) return false;
        if (!item || item.playabilityOk !== true) return false;

        const groupKey = buildMediaAnnounceGroupKey(item);
        const now = Date.now();
        const prefs = await loadPrefs();
        const pending = Array.isArray(prefs.discordMediaAnnouncePending)
            ? [...prefs.discordMediaAnnouncePending]
            : [];
        const existingIdx = pending.findIndex((entry) => entry?.groupKey === groupKey);
        const nextItem = {
            key: item.key || null,
            title: item.title || null,
            arrType: item.arrType || null,
            mediaType: item.mediaType || null,
            entityId: item.entityId ?? null,
            seasonNumber: asInt(item.seasonNumber, null),
            episodeNumber: asInt(item.episodeNumber, null),
            episodeTitle: isUsableEpisodeTitle(item.episodeTitle) ? String(item.episodeTitle).trim() : null,
            movieFileId: item.movieFileId || null,
            episodeFileId: item.episodeFileId || null,
            trackFileId: item.trackFileId || null,
            episodeId: item.episodeId || null,
            isUpgrade: !!item.isUpgrade,
        };
        const meta = {
            year: asInt(item.year, null),
            overview: item.overview || '',
            thumbUrl: item.thumbUrl || item.posterUrl || null,
            tmdbId: item.tmdbId || null,
        };

        if (existingIdx >= 0) {
            const group = pending[existingIdx];
            const items = Array.isArray(group.items) ? [...group.items] : [];
            if (!items.some((entry) => entry.key && entry.key === nextItem.key)) {
                items.push(nextItem);
            }
            pending[existingIdx] = {
                ...group,
                title: group.title || nextItem.title,
                arrType: group.arrType || nextItem.arrType,
                mediaType: group.mediaType || nextItem.mediaType,
                seasonNumber: group.seasonNumber ?? nextItem.seasonNumber,
                year: group.year || meta.year,
                overview: group.overview || meta.overview,
                thumbUrl: group.thumbUrl || meta.thumbUrl,
                tmdbId: group.tmdbId || meta.tmdbId,
                isUpgrade: !!(group.isUpgrade || nextItem.isUpgrade),
                items: items.slice(-50),
                updatedAt: now,
                flushAt: now + debounceMs(config),
            };
        } else {
            pending.push({
                groupKey,
                title: nextItem.title,
                arrType: nextItem.arrType,
                mediaType: nextItem.mediaType,
                seasonNumber: nextItem.seasonNumber,
                entityId: nextItem.entityId,
                year: meta.year,
                overview: meta.overview,
                thumbUrl: meta.thumbUrl,
                tmdbId: meta.tmdbId,
                isUpgrade: nextItem.isUpgrade,
                items: [nextItem],
                updatedAt: now,
                flushAt: now + debounceMs(config),
            });
        }

        prefs.discordMediaAnnouncePending = pending.slice(-MAX_PENDING);
        await savePrefs(prefs);
        return true;
    };

    const flushDue = async (config) => {
        if (!config?.discordEnabled || config.discordNotifyMediaReady === false) return { flushed: 0 };
        const notifier = getDiscordNotifier?.();
        if (!notifier?.notifyMediaReady && !notifier?.postEvent) return { flushed: 0 };

        const now = Date.now();
        const prefs = await loadPrefs();
        const pending = Array.isArray(prefs.discordMediaAnnouncePending)
            ? [...prefs.discordMediaAnnouncePending]
            : [];
        if (!pending.length) return { flushed: 0 };

        const due = [];
        const keep = [];
        for (const group of pending) {
            if (Number(group.flushAt) <= now) due.push(group);
            else keep.push(group);
        }
        if (!due.length) return { flushed: 0 };

        const recent = Array.isArray(prefs.discordMediaAnnounceRecent)
            ? [...prefs.discordMediaAnnounceRecent]
            : [];
        const recentSet = new Set(recent.map((entry) => entry?.hash).filter(Boolean));
        const index = typeof loadIndex === 'function' ? await loadIndex().catch(() => ({ items: [] })) : { items: [] };
        let flushed = 0;

        for (const group of due) {
            const hash = buildMediaAnnounceContentHash(group);
            if (recentSet.has(hash)) continue;
            const embed = buildMediaAnnounceEmbed(enrichAnnounceGroupFromIndex(group, index));
            try {
                const ok = notifier.notifyMediaReady
                    ? await notifier.notifyMediaReady(config, embed)
                    : await notifier.postEvent(config, embed);
                if (ok) {
                    flushed += 1;
                    recentSet.add(hash);
                    recent.push({ hash, at: new Date().toISOString(), groupKey: group.groupKey });
                }
            } catch (error) {
                log(`[discord] media announce flush failed: ${error.message}`);
                keep.push(group);
            }
        }

        prefs.discordMediaAnnouncePending = keep.slice(-MAX_PENDING);
        prefs.discordMediaAnnounceRecent = recent.slice(-MAX_RECENT);
        await savePrefs(prefs);
        return { flushed };
    };

    const postTestAnnounces = async (config, { index } = {}) => {
        if (!config?.discordEnabled) {
            const error = new Error('Enable Discord first.');
            error.statusCode = 400;
            throw error;
        }
        if (!config.discordWebhookUrl) {
            const error = new Error('Save a member notifications webhook URL first.');
            error.statusCode = 400;
            throw error;
        }
        const notifier = getDiscordNotifier?.();
        if (!notifier?.postEvent) {
            const error = new Error('Discord notifier is unavailable.');
            error.statusCode = 500;
            throw error;
        }

        const groups = pickTestMediaAnnounceGroups(index);
        const posted = [];
        for (const group of groups) {
            const embed = buildMediaAnnounceEmbed(group, { isTest: true });
            const ok = await notifier.postEvent(config, embed);
            if (!ok) {
                const error = new Error('Member webhook did not accept the test post.');
                error.statusCode = 502;
                throw error;
            }
            posted.push({
                source: group.source,
                title: group.title,
                kind: group.arrType === 'sonarr' ? 'tv' : 'movie',
            });
        }
        return { posted };
    };

    return {
        enqueue,
        flushDue,
        postTestAnnounces,
        buildMediaAnnounceGroupKey,
        buildMediaAnnounceEmbed,
        stripToPlain,
    };
};
