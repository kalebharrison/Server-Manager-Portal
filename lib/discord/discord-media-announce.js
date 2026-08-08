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

    return {
        enqueue,
        flushDue,
        buildMediaAnnounceGroupKey,
        buildMediaAnnounceEmbed,
        stripToPlain,
    };
};
