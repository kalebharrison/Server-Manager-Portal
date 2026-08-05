import test from 'node:test';
import assert from 'node:assert/strict';
import {
    collectArrIntegrityPayloads,
    enrichArrIntegrityPayload,
} from '../../lib/scanner/scanner-routes.js';

test('collectArrIntegrityPayloads extracts sonarr episode files', () => {
    const payloads = collectArrIntegrityPayloads('sonarr', {
        series: { id: 38, title: 'The Grand Tour (2016)' },
        episodes: [{ id: 7734, episodeNumber: 1, seasonNumber: 3 }],
        episodeFile: {
            id: 65081,
            path: '/media/tv/The.Grand.Tour/Season03/S03E01.mkv',
            episodeIds: [7734],
        },
        downloadId: 'abc',
    });
    assert.equal(payloads.length, 1);
    assert.equal(payloads[0].arrType, 'sonarr');
    assert.equal(payloads[0].entityId, 38);
    assert.equal(payloads[0].episodeFileId, 65081);
    assert.equal(payloads[0].filePath, '/media/tv/The.Grand.Tour/Season03/S03E01.mkv');
});

test('enrichArrIntegrityPayload builds coverage-compatible cache keys', () => {
    const enriched = enrichArrIntegrityPayload({
        arrInstances: [{
            id: 'sonarr-default',
            type: 'sonarr',
            name: 'Sonarr',
            url: 'http://sonarr.local',
            apiKey: 'x',
            enabled: true,
            isDefault: true,
        }],
    }, {
        arrType: 'sonarr',
        entityId: 38,
        episodeFileId: 65081,
        filePath: '/media/tv/Show/S01E01.mkv',
        title: 'Show',
    });
    assert.equal(enriched.arrInstanceId, 'sonarr-default');
    assert.equal(enriched.ratingKey, 'sonarr:sonarr-default:38');
    assert.equal(enriched.key, 'sonarr:sonarr-default:38:file:65081');
});
