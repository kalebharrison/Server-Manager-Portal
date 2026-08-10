import test from 'node:test';
import assert from 'node:assert/strict';
import { createSonarrSeriesBusyCheck } from '../../lib/discord/discord-media-announce-sonarr-busy.js';
import { createDiscordMediaAnnounce } from '../../lib/discord/discord-media-announce.js';

test('sonarr busy-check holds while queue has series items', async () => {
    const calls = [];
    const busy = createSonarrSeriesBusyCheck({
        request: async (_instance, path) => {
            calls.push(path);
            if (String(path).includes('/queue')) {
                return { records: [{ seriesId: 42, title: 'Downloading' }] };
            }
            return { records: [] };
        },
    });
    const held = await busy({
        arrInstances: [{ id: 's1', type: 'sonarr', name: 'Sonarr', url: 'http://s', apiKey: 'x', enabled: true }],
        discordMediaAnnounceDebounceMinutes: 60,
    }, {
        arrType: 'sonarr',
        arrInstanceId: 's1',
        entityId: 42,
        seasonNumber: 1,
        items: [{ key: 'a', episodeId: 1 }],
    });
    assert.equal(held, true);
    assert.ok(calls.some((path) => String(path).includes('/queue')));
});

test('sonarr busy-check holds for recent imports not yet announced', async () => {
    const busy = createSonarrSeriesBusyCheck({
        request: async (_instance, path) => {
            if (String(path).includes('/queue')) return { records: [] };
            return {
                records: [{
                    date: new Date().toISOString(),
                    episodeId: 99,
                    episodeFileId: 500,
                    episode: { seasonNumber: 2, episodeNumber: 5 },
                }],
            };
        },
    });
    const held = await busy({
        arrInstances: [{ id: 's1', type: 'sonarr', name: 'Sonarr', url: 'http://s', apiKey: 'x', enabled: true }],
        discordMediaAnnounceDebounceMinutes: 60,
    }, {
        arrType: 'sonarr',
        arrInstanceId: 's1',
        entityId: 7,
        seasonNumber: 2,
        items: [{ key: 'a', episodeId: 1, episodeFileId: 10 }],
    });
    assert.equal(held, true);
});

test('flushDue defers TV groups when series is busy', async () => {
    let prefs = {
        discordMediaAnnouncePending: [{
            groupKey: 'sonarr:1:S1',
            title: 'Show',
            arrType: 'sonarr',
            mediaType: 'show',
            entityId: 1,
            seasonNumber: 1,
            items: [{ key: 'a', episodeNumber: 1, episodeTitle: 'Pilot' }],
            flushAt: Date.now() - 1,
        }],
        discordMediaAnnounceRecent: [],
    };
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
        isSeriesBusy: async () => true,
    });
    const result = await announce.flushDue({
        discordEnabled: true,
        discordWebhookUrl: 'https://discord.com/api/webhooks/1/x',
        discordNotifyMediaReady: true,
        discordMediaAnnounceDebounceMinutes: 60,
    });
    assert.equal(result.flushed, 0);
    assert.equal(result.deferred, 1);
    assert.equal(posts.length, 0);
    assert.equal(prefs.discordMediaAnnouncePending.length, 1);
    assert.ok(Number(prefs.discordMediaAnnouncePending[0].flushAt) > Date.now());
});
