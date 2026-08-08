import assert from 'node:assert/strict';
import test from 'node:test';

import {
    buildExternalMediaLinks,
    buildMediaAnnounceContentHash,
    buildMediaAnnounceEmbed,
    buildMediaAnnounceGroupKey,
    createDiscordMediaAnnounce,
    isUsableEpisodeTitle,
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

test('usable episode titles reject release filenames', () => {
    assert.equal(isUsableEpisodeTitle('Pilot'), true);
    assert.equal(isUsableEpisodeTitle('Season04/Bravest.Warriors-S04E01-x265.AAC.mkv'), false);
    assert.equal(isUsableEpisodeTitle('Bravest.Warriors-S04E01-x265.AAC.mkv'), false);
});

test('embed labels upgrades vs new and lists episodes', () => {
    const ready = buildMediaAnnounceEmbed({
        title: 'Show',
        year: 2022,
        overview: 'Office mystery.',
        arrType: 'sonarr',
        seasonNumber: 1,
        isUpgrade: false,
        items: [
            { episodeNumber: 1, episodeTitle: 'Pilot' },
            { episodeNumber: 2, episodeTitle: 'Next' },
        ],
    });
    assert.equal(ready.author.name, 'New show available');
    assert.equal(ready.title, 'Show (S01E01–E02)');
    assert.ok(ready.fields.some((field) => field.name === 'Status' && field.value === 'New'));
    assert.ok(ready.fields.some((field) => field.name === 'Episodes' && /Pilot/.test(field.value)));

    const filenames = buildMediaAnnounceEmbed({
        title: 'Bravest Warriors',
        arrType: 'sonarr',
        seasonNumber: 4,
        items: [
            { episodeNumber: 1, episodeTitle: 'Season04/Bravest.Warriors-S04E01-x265.AAC.mkv' },
            { episodeNumber: 8, episodeTitle: 'Season04/Bravest.Warriors-S04E08-x265.AAC.mkv' },
        ],
    });
    assert.equal(filenames.title, 'Bravest Warriors (S04E01–E08)');
    assert.equal(filenames.fields.some((field) => field.name === 'Episodes'), false);

    const upgraded = buildMediaAnnounceEmbed({
        title: 'Movie',
        arrType: 'radarr',
        isUpgrade: true,
        items: [{ title: 'Movie' }],
        thumbUrl: 'https://image.tmdb.org/t/p/w185/poster.jpg',
        tmdbId: 438631,
        imdbId: 'tt1160419',
    }, {
        links: [{ label: 'Plex', url: 'https://app.plex.tv/desktop/#!/server/x/details?key=%2Flibrary%2Fmetadata%2F1' }],
    });
    assert.equal(upgraded.author.name, 'Upgraded movie available');
    assert.equal(upgraded.title, 'Movie');
    assert.ok(upgraded.fields.some((field) => field.name === 'Status' && field.value === 'Upgraded'));
    assert.match(upgraded.image, /w780/);
    assert.equal(upgraded.thumbnail, undefined);
    assert.match(upgraded.fields.find((field) => field.name === 'Links').value, /\[Plex\].*\[TMDb\].*\[IMDb\].*\[Trakt\]/);
});

test('external links match Notifiarr movie vs show sets', () => {
    assert.deepEqual(buildExternalMediaLinks({
        arrType: 'radarr',
        tmdbId: 11,
        imdbId: 'tt0076759',
    }).map((link) => link.label), ['TMDb', 'IMDb', 'Trakt']);
    assert.deepEqual(buildExternalMediaLinks({
        arrType: 'sonarr',
        mediaType: 'show',
        tvdbId: 99,
        tmdbId: 12,
        imdbId: 'tt1234567',
    }).map((link) => link.label), ['TVDb', 'IMDb', 'Trakt']);
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
    assert.equal(posts[0].author.name, 'Upgraded show available');

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
        resolveLibraryLinks: async (_config, query) => (
            query.mediaType === 'movie'
                ? [{ label: 'Plex', url: 'https://app.plex.tv/desktop/#!/server/x/details?key=%2Flibrary%2Fmetadata%2F1' }]
                : [{ label: 'Jellyfin', url: 'https://jf.example/web/#/details?id=abc' }]
        ),
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
    assert.equal(posts[0].content, undefined);
    assert.equal(posts[0].title, 'Dune');
    assert.equal(posts[0].author.name, 'New movie available');
    assert.ok(posts[0].fields.some((field) => field.name === 'Status' && field.value === 'New'));
    assert.equal(posts[0].footer, 'Test preview — not a new import');
    assert.ok(posts[0].image);
    assert.match(posts[0].fields.find((field) => field.name === 'Links').value, /\[Plex\].*\[TMDb\].*\[IMDb\].*\[Trakt\]/);
    assert.equal(posts[1].title, 'Severance (S01E01–E03)');
    assert.match(posts[1].fields.find((field) => field.name === 'Links').value, /\[Jellyfin\].*\[TVDb\].*\[IMDb\].*\[Trakt\]/);
});
