import test from 'node:test';
import assert from 'node:assert/strict';
import {
    QC_REASONS,
    classifyQueueItem,
    findDuplicates,
    findOrphans,
    isDoomedImportFailure,
    isReasonActionable,
    isResearchThrottled,
    isSeedingProtected,
    isSnoozed,
    isStallActionable,
    itemKey,
    nextStrikeState,
    strikeGapMsForReason,
    thresholdsFromConfig,
} from '../../lib/upgrader/qc-rules.js';

const hour = 60 * 60 * 1000;
const minute = 60 * 1000;

test('thresholdsFromConfig applies per-strike defaults', () => {
    const t = thresholdsFromConfig({});
    assert.equal(t.metaDlMinutes, 10);
    assert.equal(t.stalledHours, 2);
    assert.equal(t.completedNotImportingMinutes, 20);
    assert.equal(t.orphanGraceMinutes, 15);
    assert.equal(t.maxStrikes, 3);
    assert.equal(t.researchThrottleHours, 24);
    assert.equal(t.snoozeDefaultHours, 24);
});

test('nextStrikeState awards first immediately then waits a full gap', () => {
    const now = Date.now();
    const gapMs = 2 * hour;
    const first = nextStrikeState({
        reason: QC_REASONS.stalled,
        now,
        gapMs,
        maxStrikes: 3,
        award: true,
    });
    assert.equal(first.count, 1);
    assert.equal(first.killReady, false);
    assert.equal(first.awarded, true);

    const tooSoon = nextStrikeState({
        existing: first,
        reason: QC_REASONS.stalled,
        now: now + minute,
        gapMs,
        maxStrikes: 3,
        award: true,
    });
    assert.equal(tooSoon.count, 1);
    assert.equal(tooSoon.awarded, false);

    const second = nextStrikeState({
        existing: first,
        reason: QC_REASONS.stalled,
        now: now + gapMs,
        gapMs,
        maxStrikes: 3,
        award: true,
    });
    assert.equal(second.count, 2);
    assert.equal(second.awarded, true);

    const third = nextStrikeState({
        existing: second,
        reason: QC_REASONS.stalled,
        now: now + (2 * gapMs),
        gapMs,
        maxStrikes: 3,
        award: true,
    });
    assert.equal(third.count, 3);
    assert.equal(third.killReady, true);
    assert.equal(strikeGapMsForReason(QC_REASONS.stalled, thresholdsFromConfig({})), 2 * hour);
});

test('classifyQueueItem detects metaDL past threshold', () => {
    const now = Date.now();
    const reason = classifyQueueItem({
        now,
        thresholds: thresholdsFromConfig({ qcMetaDlMinutes: 30 }),
        clientItem: {
            client: 'qbit',
            state: 'metaDL',
            added_on: Math.floor((now - 45 * minute) / 1000),
            progress: 0,
        },
        arrItem: { status: 'downloading' },
    });
    assert.equal(reason, QC_REASONS.metaDL);
});

test('classifyQueueItem detects stalled past threshold', () => {
    const now = Date.now();
    const reason = classifyQueueItem({
        now,
        thresholds: thresholdsFromConfig({ qcStalledHours: 6 }),
        clientItem: {
            client: 'qbit',
            state: 'stalledDL',
            added_on: Math.floor((now - 7 * hour) / 1000),
            progress: 0.2,
            dlspeed: 0,
        },
        arrItem: {
            status: 'warning',
            statusMessages: [{ title: 'Download stalled' }],
        },
    });
    assert.equal(reason, QC_REASONS.stalled);
});

test('classifyQueueItem does not treat downloadClientUnavailable as stalled', () => {
    const now = Date.now();
    const reason = classifyQueueItem({
        now,
        thresholds: thresholdsFromConfig({ qcStalledHours: 1 }),
        clientItem: null,
        arrItem: {
            status: 'warning',
            trackedDownloadState: 'downloadClientUnavailable',
            added: new Date(now - 3 * hour).toISOString(),
            statusMessages: [{ title: 'Download client is unavailable' }],
        },
    });
    assert.equal(reason, null);
});

test('classifyQueueItem detects failedImport', () => {
    const reason = classifyQueueItem({
        now: Date.now(),
        thresholds: thresholdsFromConfig(),
        arrItem: {
            status: 'completed',
            trackedDownloadStatus: 'warning',
            trackedDownloadState: 'importFailed',
            errorMessage: 'Failed to import download',
        },
        clientItem: { client: 'qbit', state: 'uploading', progress: 1 },
    });
    assert.equal(reason, QC_REASONS.failedImport);
});

test('only doomed import failures are actionable', () => {
    const generic = {
        status: 'completed',
        trackedDownloadState: 'importFailed',
        errorMessage: 'Failed to import download',
    };
    const doomed = {
        status: 'completed',
        trackedDownloadState: 'importFailed',
        errorMessage: 'Not a valid media file (sample detected)',
    };
    assert.equal(isDoomedImportFailure(generic), false);
    assert.equal(isDoomedImportFailure(doomed), true);
    assert.equal(isReasonActionable({ reason: QC_REASONS.failedImport, arrItem: generic }), false);
    assert.equal(isReasonActionable({ reason: QC_REASONS.failedImport, arrItem: doomed }), true);
    assert.equal(isDoomedImportFailure({
        trackedDownloadState: 'importFailed',
        statusMessages: [{ messages: ['Unwanted extension found: exe'] }],
    }), true);
    assert.equal(isDoomedImportFailure({
        trackedDownloadState: 'importFailed',
        failMessage: 'Archive is encrypted / password protected',
    }), true);
});

test('stall kills are held when download client is configured but unreachable', () => {
    assert.equal(isStallActionable({
        clientItem: { client: 'qbit', id: 'a', state: 'stalledDL', progress: 0.1, dlspeed: 0 },
        clients: { qbit: false, sab: false },
        networkHealth: { qbit: { ok: false, reason: 'unreachable' } },
        qbitConfigured: true,
        sabConfigured: false,
    }), false);
});

test('stall kills are held when qBit reports network down even if multiple torrents are idle', () => {
    assert.equal(isStallActionable({
        clientItem: { client: 'qbit', id: 'a', state: 'stalledDL', progress: 0.2, dlspeed: 0 },
        clients: { qbit: true, sab: false },
        networkHealth: { qbit: { ok: false, reason: 'dht_dead', dhtNodes: 0 } },
        qbitConfigured: true,
        sabConfigured: false,
    }), false);
});

test('stall kills proceed when downloader network is up even if all speeds are zero', () => {
    assert.equal(isStallActionable({
        clientItem: { client: 'qbit', id: 'a', state: 'stalledDL', progress: 0.2, dlspeed: 0 },
        clients: { qbit: true, sab: false },
        networkHealth: { qbit: { ok: true, connectionStatus: 'firewalled', dhtNodes: 40 } },
        qbitConfigured: true,
        sabConfigured: false,
    }), true);
});

test('stall kills are held when SAB DNS/servers look down', () => {
    assert.equal(isStallActionable({
        clientItem: { client: 'sab', id: 'nzo1', state: 'Downloading', progress: 0.1 },
        clients: { qbit: false, sab: true },
        networkHealth: { sab: { ok: false, reason: 'dns_failed', dnslookup: 'Failed' } },
        qbitConfigured: false,
        sabConfigured: true,
    }), false);
});

test('classifyQueueItem detects completedNotImporting past threshold', () => {
    const now = Date.now();
    const reason = classifyQueueItem({
        now,
        thresholds: thresholdsFromConfig({ qcCompletedNotImportingMinutes: 60 }),
        arrItem: {
            status: 'completed',
            trackedDownloadState: 'importPending',
            added: new Date(now - 90 * minute).toISOString(),
        },
        clientItem: {
            client: 'qbit',
            state: 'uploading',
            progress: 1,
            completion_on: Math.floor((now - 90 * minute) / 1000),
        },
    });
    assert.equal(reason, QC_REASONS.completedNotImporting);
});

test('classifyQueueItem returns null when healthy', () => {
    const now = Date.now();
    const reason = classifyQueueItem({
        now,
        thresholds: thresholdsFromConfig(),
        arrItem: { status: 'downloading', trackedDownloadState: 'downloading' },
        clientItem: {
            client: 'qbit',
            state: 'downloading',
            progress: 0.4,
            dlspeed: 500000,
            added_on: Math.floor(now / 1000),
        },
    });
    assert.equal(reason, null);
});

test('findDuplicates keeps best progress and marks losers', () => {
    const dupes = findDuplicates([
        { id: 1, movieId: 10, size: 100, sizeleft: 80 },
        { id: 2, movieId: 10, size: 100, sizeleft: 10 },
        { id: 3, movieId: 11, size: 50, sizeleft: 0 },
    ]);
    assert.equal(dupes.length, 1);
    assert.equal(dupes[0].id, 1);
    assert.equal(dupes[0].reason, QC_REASONS.duplicate);
    assert.equal(dupes[0].duplicateOf, 2);
});

test('findDuplicates groups sonarr episodes', () => {
    const dupes = findDuplicates([
        { id: 1, seriesId: 5, episodeId: 9, size: 10, sizeleft: 5 },
        { id: 2, seriesId: 5, episodeId: 9, size: 20, sizeleft: 0 },
        { id: 3, seriesId: 5, episodeId: 10, size: 20, sizeleft: 0 },
    ]);
    assert.equal(dupes.length, 1);
    assert.equal(dupes[0].id, 1);
});

test('findOrphans skips known downloadIds and seeding protected', () => {
    const orphans = findOrphans({
        arrDownloadIds: ['AAA', 'bbb'],
        clientItems: [
            { id: 'aaa', hash: 'aaa', client: 'qbit', state: 'downloading', progress: 0.5 },
            { id: 'ccc', hash: 'ccc', client: 'qbit', state: 'downloading', progress: 0.1 },
            { id: 'ddd', hash: 'ddd', client: 'qbit', state: 'uploading', progress: 1 },
        ],
    });
    assert.equal(orphans.length, 1);
    assert.equal(orphans[0].id, 'ccc');
    assert.equal(orphans[0].reason, QC_REASONS.orphan);
});

test('findOrphans grace and recent-hunt protection prevent false kills', () => {
    const now = Date.now();
    const orphans = findOrphans({
        now,
        minAgeMs: 45 * 60 * 1000,
        protectedReleaseTokens: ['willyswonderland2021uhdbluray2160p'],
        arrDownloadIds: [],
        clientItems: [
            {
                id: 'fresh',
                hash: 'fresh',
                name: 'The.Addams.Family.2.2021.BDREMUX.2160p.seleZen.mkv',
                client: 'qbit',
                state: 'downloading',
                progress: 0.01,
                added_on: Math.floor(now / 1000) - 60,
            },
            {
                id: 'hunt',
                hash: 'hunt',
                name: 'Willys.Wonderland.2021.UHD.BluRay.2160p.DTS-HD.MA.5.1.DV.HDR.HEVC.REMUX-SHiTRiPS',
                client: 'qbit',
                state: 'downloading',
                progress: 0.2,
                added_on: Math.floor(now / 1000) - (2 * 60 * 60),
            },
            {
                id: 'old',
                hash: 'old',
                name: 'Truly.Orphaned.2007.1080p.mkv',
                client: 'qbit',
                state: 'downloading',
                progress: 0.1,
                added_on: Math.floor(now / 1000) - (3 * 60 * 60),
            },
        ],
    });
    assert.equal(orphans.length, 2);
    assert.equal(orphans.find((row) => row.id === 'fresh')?.withinGrace, true);
    assert.equal(orphans.find((row) => row.id === 'hunt'), undefined);
    assert.equal(orphans.find((row) => row.id === 'old')?.withinGrace, false);
});

test('isSeedingProtected only for completed qbit upload states', () => {
    assert.equal(isSeedingProtected({ client: 'qbit', state: 'uploading', progress: 1 }), true);
    assert.equal(isSeedingProtected({ client: 'qbit', state: 'stalledUP', progress: 1 }), true);
    assert.equal(isSeedingProtected({ client: 'qbit', state: 'forcedUP', progress: 1 }), true);
    assert.equal(isSeedingProtected({ client: 'qbit', state: 'uploading', progress: 0.9 }), false);
    assert.equal(isSeedingProtected({ client: 'sab', state: 'Completed', progress: 1 }), false);
});

test('isSnoozed and isResearchThrottled honor until timestamps', () => {
    const now = Date.now();
    const prefs = {
        downloadSnoozed: { 'qbit:abc': new Date(now + hour).toISOString() },
        researchCooldowns: { 'some title': new Date(now + hour).toISOString() },
    };
    assert.equal(isSnoozed(prefs, 'qbit:abc', now), true);
    assert.equal(isSnoozed(prefs, 'qbit:abc', now + 2 * hour), false);
    assert.equal(isResearchThrottled(prefs, 'Some Title', now), true);
    assert.equal(isResearchThrottled(prefs, 'other', now), false);
});

test('itemKey is stable for client and arr items', () => {
    assert.equal(itemKey({ client: 'qbit', id: 'AbC' }), 'qbit:abc');
    assert.equal(itemKey({ arrType: 'radarr', arrInstanceId: 'r1', arrQueueId: 9 }), 'arr:radarr:r1:9');
});
