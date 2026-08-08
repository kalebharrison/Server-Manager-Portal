import assert from 'node:assert/strict';
import test from 'node:test';

import {
    buildMediaAnnounceContentHash,
    buildMediaAnnounceEmbed,
    buildMediaAnnounceGroupKey,
    createDiscordMediaAnnounce,
    pickTestMediaAnnounceGroups,
} from '../../lib/discord/discord-media-announce.js';

test('group keys lump TV by series+season', () => {
    assert.equal(buildMediaAnnounceGroupKey({
        arrType: 'sonarr',
        entityId: 12,
        seasonNumber: 2,
    }), 'sonarr:12:S2');
    assert.equal(buildMediaAnnounceGroupKey({
        arrType: 'radarr',
        entityId: 99,
    }), 'radarr:99');
    assert.equal(buildMediaAnnounceGroupKey({
        arrType: 'lidarr',
        entityId: 7,
    }), 'lidarr:7');
});

test('embed labels upgrades vs new and lists episodes', () => {
    const ready = buildMediaAnnounceEmbed({
        title: 'Show',
        arrType: 'sonarr',
        seasonNumber: 1,
        isUpgrade: false,
        items: [
            { episodeNumber: 1, episodeTitle: 'Pilot' },
            { episodeNumber: 2, episodeTitle: 'Next' },
        ],
    });
    assert.equal(ready.title, 'Now available');
    assert.match(ready.description, /Season 1/);
    assert.equal(ready.fields[0].name, 'Episodes');

    const upgraded = buildMediaAnnounceEmbed({
        title: 'Movie',
        arrType: 'radarr',
        isUpgrade: true,
        items: [{ title: 'Movie' }],
    });
    assert.equal(upgraded.title, 'Upgraded');
    assert.match(upgraded.description, /upgraded/);
});

test('enqueue requires playability and debounce flush posts once', async () => {
    let prefs = { discordMediaAnnouncePending: [], discordMediaAnnounceRecent: [] };
    const posts = [];
    const announce = createDiscordMediaAnnounce({
        loadPrefs: async () => prefs,
        savePrefs: async (next) => { prefs = next; },
        getDiscordNotifier: () => ({
            notifyMediaReady: async (_config, payload) => {
                posts.push(payload);
                return true;
            },
        }),
    });

    const config = {
        discordEnabled: true,
        discordWebhookUrl: 'https://discord.com/api/webhooks/1/x',
        discordNotifyMediaReady: true,
        discordMediaAnnounceDebounceMinutes: 10,
    };

    assert.equal(await announce.enqueue(config, {
        arrType: 'sonarr',
        entityId: 1,
        seasonNumber: 1,
        episodeNumber: 1,
        title: 'Show',
        key: 'a',
        playabilityOk: false,
    }), false);

    assert.equal(await announce.enqueue(config, {
        arrType: 'sonarr',
        entityId: 1,
        seasonNumber: 1,
        episodeNumber: 1,
        episodeTitle: 'Pilot',
        title: 'Show',
        key: 'a',
        playabilityOk: true,
    }), true);
    await announce.enqueue(config, {
        arrType: 'sonarr',
        entityId: 1,
        seasonNumber: 1,
        episodeNumber: 2,
        episodeTitle: 'Next',
        title: 'Show',
        key: 'b',
        playabilityOk: true,
        isUpgrade: true,
    });

    assert.equal(prefs.discordMediaAnnouncePending.length, 1);
    assert.equal(prefs.discordMediaAnnouncePending[0].items.length, 2);
    assert.equal(prefs.discordMediaAnnouncePending[0].isUpgrade, true);

    // Force due
    prefs.discordMediaAnnouncePending[0].flushAt = Date.now() - 1;
    const first = await announce.flushDue(config);
    assert.equal(first.flushed, 1);
    assert.equal(posts.length, 1);
    assert.equal(posts[0].title, 'Upgraded');

    // Dedupes identical content
    prefs.discordMediaAnnouncePending = [{
        ...prefs.discordMediaAnnounceRecent[0]
            ? {
                groupKey: 'sonarr:1:S1',
                title: 'Show',
                arrType: 'sonarr',
                seasonNumber: 1,
                isUpgrade: true,
                items: [
                    { key: 'a', episodeNumber: 1, episodeTitle: 'Pilot' },
                    { key: 'b', episodeNumber: 2, episodeTitle: 'Next' },
                ],
                flushAt: Date.now() - 1,
            }
            : null,
    }].filter(Boolean);
    // Rebuild identical pending from hash inputs
    prefs.discordMediaAnnouncePending = [{
        groupKey: 'sonarr:1:S1',
        title: 'Show',
        arrType: 'sonarr',
        seasonNumber: 1,
        isUpgrade: true,
        items: [
            { key: 'a', episodeNumber: 1, episodeTitle: 'Pilot' },
            { key: 'b', episodeNumber: 2, episodeTitle: 'Next' },
        ],
        flushAt: Date.now() - 1,
    }];
    const hash = buildMediaAnnounceContentHash(prefs.discordMediaAnnouncePending[0]);
    assert.ok(prefs.discordMediaAnnounceRecent.some((entry) => entry.hash === hash));
    const second = await announce.flushDue(config);
    assert.equal(second.flushed, 0);
    assert.equal(posts.length, 1);
});

test('test announce groups prefer library titles then samples', () => {
    const fromIndex = pickTestMediaAnnounceGroups({
        items: [
            { mediaType: 'movie', hasFile: true, title: 'Wicker', addedAt: '2026-01-02', ratingKey: 'radarr:1:9' },
            {
                mediaType: 'show',
                arrType: 'sonarr',
                hasFile: true,
                title: 'Ted Lasso',
                addedAt: '2026-01-03',
                ratingKey: 'sonarr:1:4',
                episodes: [
                    { seasonNumber: 1, episodeNumber: 1, title: 'Pilot' },
                    { seasonNumber: 1, episodeNumber: 2, title: 'Biscuits' },
                    { seasonNumber: 2, episodeNumber: 1, title: 'Goodbye' },
                ],
            },
        ],
    });
    assert.equal(fromIndex[0].title, 'Wicker');
    assert.equal(fromIndex[0].source, 'library');
    assert.equal(fromIndex[1].title, 'Ted Lasso');
    assert.equal(fromIndex[1].seasonNumber, 1);
    assert.equal(fromIndex[1].items.length, 2);

    const samples = pickTestMediaAnnounceGroups({ items: [] });
    assert.equal(samples[0].source, 'sample');
    assert.equal(samples[1].source, 'sample');
    assert.equal(samples[1].arrType, 'sonarr');
});

test('postTestAnnounces posts movie and TV immediately', async () => {
    const posts = [];
    const announce = createDiscordMediaAnnounce({
        loadPrefs: async () => ({}),
        savePrefs: async () => {},
        getDiscordNotifier: () => ({
            postEvent: async (_config, payload) => {
                posts.push(payload);
                return true;
            },
        }),
    });
    const result = await announce.postTestAnnounces({
        discordEnabled: true,
        discordWebhookUrl: 'https://discord.com/api/webhooks/1/x',
    }, { index: { items: [] } });
    assert.equal(result.posted.length, 2);
    assert.equal(posts.length, 2);
    assert.match(posts[0].content, /Test preview/);
    assert.equal(posts[0].title, 'Now available');
    assert.match(posts[1].description, /Season 1/);
});
