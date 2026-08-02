import test from 'node:test';
import assert from 'node:assert/strict';
import { createUpgraderHunt } from '../../lib/upgrader/upgrader-hunt.js';

test('previewItem missing show path does not hard-skip on !hasFile', async () => {
    const calls = [];
    const hunt = createUpgraderHunt({
        request: async (instance, path, options = {}) => {
            calls.push({ path, options });
            return { id: 99 };
        },
        loadIndex: async () => ({ items: [] }),
        loadPrefs: async () => ({}),
        appendAudit: async () => {},
    });

    const preview = await hunt.previewItem({
        upgraderEnabled: true,
        arrInstances: [{
            id: 'sonarr-1',
            type: 'sonarr',
            name: 'Sonarr',
            url: 'http://sonarr.local',
            apiKey: 'x',
            enabled: true,
        }],
    }, {
        ratingKey: 'sonarr:sonarr-1:7',
        title: 'Gap Show',
        mediaType: 'show',
        arrType: 'sonarr',
        arrInstanceId: 'sonarr-1',
        arrInstanceName: 'Sonarr',
        entityId: 7,
        hasFile: false,
        huntPath: 'missing',
        huntMissingEligible: true,
        missingAiredCount: 4,
    });

    assert.equal(preview.success, true);
    assert.equal(preview.huntPath, 'missing');
    assert.equal(preview.action, 'missing_search');
    assert.match(preview.reason, /4 missing aired/);
});

test('upgradeItem missing movie grabs interactive release without CF delta', async () => {
    const posts = [];
    const hunt = createUpgraderHunt({
        request: async (instance, path, options = {}) => {
            if (path.startsWith('/api/v3/release') && options.method === 'POST') {
                posts.push(options.body);
                return { id: 1 };
            }
            if (path.startsWith('/api/v3/release?movieId=')) {
                return [
                    { title: 'Movie.2024.WEBDL-1080p', rejected: true, rejections: ['Blocked'] },
                    { title: 'Movie.2024.BluRay-1080p', rejected: false, customFormatScore: 50 },
                    { title: 'Movie.2024.Remux-2160p', rejected: false, customFormatScore: 200 },
                ];
            }
            return {};
        },
        loadIndex: async () => ({ items: [] }),
        loadPrefs: async () => ({}),
        appendAudit: async () => {},
    });

    const config = {
        upgraderEnabled: true,
        arrInstances: [{
            id: 'radarr-1',
            type: 'radarr',
            name: 'Radarr',
            url: 'http://radarr.local',
            apiKey: 'x',
            enabled: true,
        }],
    };
    const item = {
        ratingKey: 'radarr:radarr-1:3',
        title: 'Streaming Movie',
        mediaType: 'movie',
        arrType: 'radarr',
        arrInstanceId: 'radarr-1',
        arrInstanceName: 'Radarr',
        entityId: 3,
        hasFile: false,
        huntPath: 'missing',
        huntMissingEligible: true,
    };

    const preview = await hunt.previewItem(config, item);
    assert.equal(preview.success, true);
    assert.equal(preview.releaseTitle, 'Movie.2024.Remux-2160p');

    const result = await hunt.upgradeItem(config, item, { dryRun: false });
    assert.equal(result.grabbed, true);
    assert.equal(posts.length, 1);
    assert.equal(posts[0].title, 'Movie.2024.Remux-2160p');
});

test('upgradeItem missing show posts MissingEpisodeSearch', async () => {
    const commands = [];
    const hunt = createUpgraderHunt({
        request: async (instance, path, options = {}) => {
            if (path === '/api/v3/command') {
                commands.push(options.body);
                return { id: 55 };
            }
            return {};
        },
        loadIndex: async () => ({ items: [] }),
        loadPrefs: async () => ({}),
        appendAudit: async () => {},
    });

    const result = await hunt.upgradeItem({
        upgraderEnabled: true,
        arrInstances: [{
            id: 'sonarr-1',
            type: 'sonarr',
            name: 'Sonarr',
            url: 'http://sonarr.local',
            apiKey: 'x',
            enabled: true,
        }],
    }, {
        ratingKey: 'sonarr:sonarr-1:9',
        title: 'Gap Show',
        mediaType: 'show',
        arrType: 'sonarr',
        arrInstanceId: 'sonarr-1',
        entityId: 9,
        hasFile: false,
        huntPath: 'missing',
        huntMissingEligible: true,
        missingAiredCount: 2,
    }, { dryRun: false });

    assert.equal(result.grabbed, true);
    assert.deepEqual(commands[0], { name: 'MissingEpisodeSearch', seriesId: 9 });
});
