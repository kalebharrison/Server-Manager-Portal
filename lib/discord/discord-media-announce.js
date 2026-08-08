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

const newestFirst = (left, right) => String(right?.addedAt || '').localeCompare(String(left?.addedAt || ''));

const sampleMovieGroup = () => ({
    source: 'sample',
    title: 'Dune',
    arrType: 'radarr',
    mediaType: 'movie',
    isUpgrade: false,
    items: [{ title: 'Dune', key: 'sample:movie' }],
});

const sampleShowGroup = () => ({
    source: 'sample',
    title: 'Severance',
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
        items: rows.slice(0, 8).map((episode, index) => ({
            episodeNumber: Number(episode.episodeNumber) || index + 1,
            episodeTitle: episode.episodeTitle || episode.title || null,
            key: episode.episodeFileId || episode.episodeId || `${show.ratingKey || show.title}:e${index}`,
        })),
    };
};

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
            isUpgrade: false,
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
            seasonNumber: season.seasonNumber,
            isUpgrade: false,
            items: season.items,
        };
    }

    return [movieGroup, showGroup];
};

export const buildMediaAnnounceEmbed = (group = {}) => {
    const items = Array.isArray(group.items) ? group.items : [];
    const title = group.title || items[0]?.title || 'Media';
    const isUpgrade = !!group.isUpgrade;
    const kind = String(group.arrType || items[0]?.arrType || '').toLowerCase();
    const verb = isUpgrade ? 'Upgraded' : 'Now available';
    let description = `**${title}** is ready on the server.`;
    const fields = [];

    if (kind === 'sonarr' || group.mediaType === 'show') {
        const season = asInt(group.seasonNumber ?? items[0]?.seasonNumber, null);
        const episodeBits = items
            .map((entry) => {
                const ep = asInt(entry.episodeNumber, null);
                if (ep == null) return null;
                const label = entry.episodeTitle ? `E${String(ep).padStart(2, '0')} — ${entry.episodeTitle}` : `E${String(ep).padStart(2, '0')}`;
                return label;
            })
            .filter(Boolean);
        const uniqueEps = [...new Set(episodeBits)];
        description = season != null
            ? `**${title}** — Season ${season} (${items.length} episode${items.length === 1 ? '' : 's'}) is ready.`
            : `**${title}** (${items.length} episode${items.length === 1 ? '' : 's'}) is ready.`;
        if (isUpgrade) description = description.replace(' is ready.', ' was upgraded.');
        if (uniqueEps.length && uniqueEps.length <= EPISODE_LIST_CAP) {
            fields.push({ name: 'Episodes', value: uniqueEps.join('\n').slice(0, 1000), inline: false });
        } else if (uniqueEps.length > EPISODE_LIST_CAP) {
            fields.push({
                name: 'Episodes',
                value: `${uniqueEps.slice(0, EPISODE_LIST_CAP).join('\n')}\n…and ${uniqueEps.length - EPISODE_LIST_CAP} more`,
                inline: false,
            });
        }
    } else if (kind === 'lidarr' || group.mediaType === 'album') {
        description = isUpgrade
            ? `**${title}** was upgraded and verified.`
            : `**${title}** is ready on the server.`;
    } else {
        description = isUpgrade
            ? `**${title}** was upgraded and verified.`
            : `**${title}** is ready on the server.`;
    }

    return {
        title: verb,
        description,
        fields,
        color: isUpgrade ? 0xa855f7 : 0x22c55e,
    };
};

export const createDiscordMediaAnnounce = ({
    loadPrefs,
    savePrefs,
    getDiscordNotifier = () => null,
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
            episodeTitle: item.episodeTitle || null,
            movieFileId: item.movieFileId || null,
            episodeFileId: item.episodeFileId || null,
            trackFileId: item.trackFileId || null,
            episodeId: item.episodeId || null,
            isUpgrade: !!item.isUpgrade,
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
        let flushed = 0;

        for (const group of due) {
            const hash = buildMediaAnnounceContentHash(group);
            if (recentSet.has(hash)) continue;
            const embed = buildMediaAnnounceEmbed(group);
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
            const embed = buildMediaAnnounceEmbed(group);
            const ok = await notifier.postEvent(config, {
                ...embed,
                content: 'Test preview — not a new import.',
            });
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
