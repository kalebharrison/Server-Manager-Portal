import test from 'node:test';
import assert from 'node:assert/strict';
import {
    QC_REASONS,
    classifyQueueItem,
    findDuplicates,
    findOrphans,
    isDoomedImportFailure,
    isMetaDlActionable,
    isReasonActionable,
    isResearchThrottled,
    isResolutionDowngradeImportFailure,
    isSeedingProtected,
    isSnoozed,
    isStallActionable,
    itemKey,
    nextStrikeState,
    strikeGapMsForReason,
    thresholdsFromConfig,
} from '../../lib/upgrader/qc-rules.js';
import {
    QC_CLIENT_RECOMMENDED,
    summarizeQbitAlignment,
    summarizeSabAlignment,
} from '../../lib/upgrader/qc-client-optimize.js';

const hour = 60 * 60 * 1000;
const minute = 60 * 1000;

test('thresholdsFromConfig applies per-strike defaults', () => {
    const t = thresholdsFromConfig({});
    assert.equal(t.metaDlMinutes, 20);
    assert.equal(t.stalledHours, 2);
    assert.equal(t.completedNotImportingMinutes, 90);
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

test('resolution downgrade not-an-upgrade is doomed even while importPending', () => {
    const arrItem = {
        status: 'completed',
        trackedDownloadStatus: 'warning',
        trackedDownloadState: 'importPending',
        statusMessages: [{
            title: 'Futurama S11E01 REAL MULTi 1080p WEB H264-UKDTV',
            messages: [
                'Not an upgrade for existing episode file(s). Existing quality: WEBDL-2160p. New Quality WEBDL-1080p.',
            ],
        }],
    };
    assert.equal(isResolutionDowngradeImportFailure(arrItem), true);
    assert.equal(isDoomedImportFailure(arrItem), true);
    assert.equal(classifyQueueItem({
        now: Date.now(),
        thresholds: thresholdsFromConfig(),
        arrItem,
        clientItem: { client: 'qbit', state: 'uploading', progress: 1 },
    }), QC_REASONS.qualityDowngrade);
    assert.equal(isReasonActionable({ reason: QC_REASONS.qualityDowngrade, arrItem }), true);
});

test('same-resolution not-an-upgrade is not a resolution downgrade', () => {
    const arrItem = {
        trackedDownloadState: 'importPending',
        trackedDownloadStatus: 'warning',
        statusMessages: [{
            messages: [
                'Not an upgrade for existing episode file(s). Existing quality: WEBDL-1080p. New Quality WEBDL-1080p.',
            ],
        }],
    };
    assert.equal(isResolutionDowngradeImportFailure(arrItem), false);
});

test('custom format upgrade rejects are not treated as resolution downgrades', () => {
    const now = Date.now();
    const arrItem = {
        trackedDownloadState: 'importPending',
        trackedDownloadStatus: 'warning',
        added: new Date(now - 3 * 60 * 60 * 1000).toISOString(),
        statusMessages: [{
            messages: [
                'Not a Custom Format upgrade for existing movie file(s). New: [DV HDR10, LQ (Release Title)] (-5000) do not improve on Existing: [DD] (750)',
            ],
        }],
    };
    assert.equal(isResolutionDowngradeImportFailure(arrItem), false);
    assert.notEqual(classifyQueueItem({
        now,
        thresholds: thresholdsFromConfig({ qcCompletedNotImportingMinutes: 60 }),
        arrItem,
        clientItem: {
            client: 'qbit',
            state: 'uploading',
            progress: 1,
            completion_on: Math.floor((now - 2 * 60 * 60 * 1000) / 1000),
        },
    }), QC_REASONS.qualityDowngrade);
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
            added_on: Math.floor((now - 3 * hour) / 1000),
            completion_on: Math.floor((now - 90 * minute) / 1000),
        },
    });
    assert.equal(reason, QC_REASONS.completedNotImporting);
});

test('waiting to import is not classified as failedImport', () => {
    const now = Date.now();
    const young = classifyQueueItem({
        now,
        thresholds: thresholdsFromConfig({ qcCompletedNotImportingMinutes: 20 }),
        arrItem: {
            status: 'completed',
            trackedDownloadStatus: 'warning',
            trackedDownloadState: 'importPending',
            statusMessages: [{ title: 'Waiting to import' }],
            added: new Date(now - 5 * minute).toISOString(),
        },
        clientItem: {
            client: 'sab',
            state: 'Completed',
            progress: 1,
            completedAt: now - 5 * minute,
        },
    });
    assert.equal(young, null);

    const aged = classifyQueueItem({
        now,
        thresholds: thresholdsFromConfig({ qcCompletedNotImportingMinutes: 20 }),
        arrItem: {
            status: 'completed',
            trackedDownloadStatus: 'warning',
            trackedDownloadState: 'importPending',
            statusMessages: [{ title: 'Waiting to import' }],
            added: new Date(now - 45 * minute).toISOString(),
        },
        clientItem: {
            client: 'sab',
            state: 'Completed',
            progress: 1,
            completedAt: now - 45 * minute,
        },
    });
    assert.equal(aged, QC_REASONS.completedNotImporting);
});

test('active importing is never completedNotImporting even when hours old', () => {
    const now = Date.now();
    const reason = classifyQueueItem({
        now,
        thresholds: thresholdsFromConfig({ qcCompletedNotImportingMinutes: 20 }),
        arrItem: {
            status: 'completed',
            trackedDownloadState: 'importing',
            trackedDownloadStatus: 'ok',
            added: new Date(now - 3 * hour).toISOString(),
        },
        clientItem: {
            client: 'sab',
            state: 'completed',
            progress: 1,
            completedAt: now - 2 * hour,
        },
    });
    assert.equal(reason, null);
});

test('importPending behind an active import is not completedNotImporting', () => {
    const now = Date.now();
    const waiting = {
        arrType: 'radarr',
        arrInstanceId: 'main',
        arrQueueId: 2,
        status: 'completed',
        trackedDownloadState: 'importPending',
        trackedDownloadStatus: 'ok',
        added: new Date(now - 90 * minute).toISOString(),
    };
    const active = {
        arrType: 'radarr',
        arrInstanceId: 'main',
        arrQueueId: 1,
        status: 'completed',
        trackedDownloadState: 'importing',
    };
    const reason = classifyQueueItem({
        now,
        thresholds: thresholdsFromConfig({ qcCompletedNotImportingMinutes: 20 }),
        arrItem: waiting,
        peerArrItems: [active, waiting],
        clientItem: {
            client: 'sab',
            state: 'completed',
            progress: 1,
            completedAt: now - 90 * minute,
        },
    });
    assert.equal(reason, null);
    assert.equal(isReasonActionable({
        reason: QC_REASONS.completedNotImporting,
        arrItem: waiting,
    }, { arrItems: [active, waiting] }), false);
});

test('importPending behind an older pending peer is not completedNotImporting', () => {
    const now = Date.now();
    const older = {
        arrType: 'radarr',
        arrInstanceId: 'main',
        arrQueueId: 1,
        status: 'completed',
        trackedDownloadState: 'importPending',
        estimatedCompletionTime: new Date(now - 3 * hour).toISOString(),
        added: new Date(now - 4 * hour).toISOString(),
    };
    const newer = {
        arrType: 'radarr',
        arrInstanceId: 'main',
        arrQueueId: 2,
        status: 'completed',
        trackedDownloadState: 'importPending',
        estimatedCompletionTime: new Date(now - 2 * hour).toISOString(),
        added: new Date(now - 3 * hour).toISOString(),
    };
    const reason = classifyQueueItem({
        now,
        thresholds: thresholdsFromConfig({ qcCompletedNotImportingMinutes: 20 }),
        arrItem: newer,
        peerArrItems: [older, newer],
        clientItem: {
            client: 'sab',
            state: 'completed',
            progress: 1,
            completedAt: now - 2 * hour,
        },
    });
    assert.equal(reason, null);
});

test('importPending alone past threshold is still completedNotImporting', () => {
    const now = Date.now();
    const waiting = {
        arrType: 'radarr',
        arrInstanceId: 'main',
        arrQueueId: 2,
        status: 'completed',
        trackedDownloadState: 'importPending',
        added: new Date(now - 90 * minute).toISOString(),
    };
    const reason = classifyQueueItem({
        now,
        thresholds: thresholdsFromConfig({ qcCompletedNotImportingMinutes: 20 }),
        arrItem: waiting,
        peerArrItems: [waiting],
        clientItem: {
            client: 'sab',
            state: 'completed',
            progress: 1,
            completedAt: now - 90 * minute,
        },
    });
    assert.equal(reason, QC_REASONS.completedNotImporting);
});

test('large remuxes get a longer CNI threshold before first strike', () => {
    const now = Date.now();
    const arrItem = {
        status: 'completed',
        trackedDownloadState: 'importPending',
        size: 50 * (1024 ** 3),
        added: new Date(now - 2 * hour).toISOString(),
    };
    const clientItem = {
        client: 'sab',
        state: 'completed',
        progress: 1,
        size: 50 * (1024 ** 3),
        completedAt: now - 100 * minute,
    };
    // base 90 + 50*2=100 → 190 minutes; 100 min completed age is still inside grace
    const young = classifyQueueItem({
        now,
        thresholds: thresholdsFromConfig({}),
        arrItem,
        clientItem,
    });
    assert.equal(young, null);

    const aged = classifyQueueItem({
        now,
        thresholds: thresholdsFromConfig({}),
        arrItem,
        clientItem: { ...clientItem, completedAt: now - 200 * minute },
    });
    assert.equal(aged, QC_REASONS.completedNotImporting);
});

test('completedNotImporting ages from completion not grab time', () => {
    const now = Date.now();
    // Grabbed 2h ago, finished 5 minutes ago — still within CNI grace.
    const reason = classifyQueueItem({
        now,
        thresholds: thresholdsFromConfig({ qcCompletedNotImportingMinutes: 20 }),
        arrItem: {
            status: 'completed',
            trackedDownloadState: 'importPending',
            added: new Date(now - 2 * hour).toISOString(),
        },
        clientItem: {
            client: 'sab',
            state: 'completed',
            progress: 1,
            completedAt: now - 5 * minute,
        },
    });
    assert.equal(reason, null);
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

test('stopped/paused completed qBit seeds are protected from orphans', () => {
    assert.equal(isSeedingProtected({ client: 'qbit', state: 'stoppedUP', progress: 1 }), true);
    assert.equal(isSeedingProtected({ client: 'qbit', state: 'pausedUP', progress: 1 }), true);
    assert.equal(isSeedingProtected({ client: 'qbit', state: 'checkingUP', progress: 1 }), true);
    const orphans = findOrphans({
        arrDownloadIds: [],
        clientItems: [
            { id: 'a', hash: 'a', client: 'qbit', state: 'stoppedUP', progress: 1 },
            { id: 'b', hash: 'b', client: 'qbit', state: 'pausedUP', progress: 1 },
            { id: 'c', hash: 'c', client: 'qbit', state: 'downloading', progress: 0.2 },
        ],
    });
    assert.equal(orphans.length, 1);
    assert.equal(orphans[0].id, 'c');
});

test('successful SAB history is not orphan-killed', () => {
    const orphans = findOrphans({
        arrDownloadIds: [],
        clientItems: [
            {
                id: 'nzo1',
                client: 'sab',
                source: 'history',
                state: 'completed',
                progress: 1,
            },
            {
                id: 'nzo2',
                client: 'sab',
                source: 'history',
                state: 'failed',
                progress: 0.5,
                failMessage: 'Unpack failed',
            },
            {
                id: 'nzo3',
                client: 'sab',
                source: 'queue',
                state: 'downloading',
                progress: 0.2,
            },
        ],
    });
    assert.equal(orphans.length, 2);
    assert.deepEqual(orphans.map((row) => row.id).sort(), ['nzo2', 'nzo3']);
});

test('metaDL kills are held when qBit DHT/network is down', () => {
    assert.equal(isMetaDlActionable({
        clientItem: { client: 'qbit', id: 'a', state: 'metaDL', progress: 0 },
        clients: { qbit: true },
        networkHealth: { qbit: { ok: false, reason: 'dht_dead', dhtNodes: 0 } },
        qbitConfigured: true,
    }), false);

    assert.equal(isMetaDlActionable({
        clientItem: { client: 'qbit', id: 'a', state: 'metaDL', progress: 0 },
        clients: { qbit: true },
        networkHealth: { qbit: { ok: true, dhtNodes: 40 } },
        qbitConfigured: true,
    }), true);

    assert.equal(isReasonActionable({
        reason: QC_REASONS.metaDL,
        client: { client: 'qbit', id: 'a', state: 'metaDL' },
    }, {
        clients: { qbit: true },
        networkHealth: { qbit: { ok: false, reason: 'disconnected' } },
        qbitConfigured: true,
    }), false);
});

test('summarize client alignment detects SAB discard and short qBit seed time', () => {
    const sab = summarizeSabAlignment({ no_dupes: 1, no_smart_dupes: 0, no_series_dupes: 0 });
    assert.equal(sab.aligned, false);
    assert.equal(QC_CLIENT_RECOMMENDED.sab.no_dupes, 0);

    const qbit = summarizeQbitAlignment({
        max_seeding_time: 1,
        max_active_torrents: 23,
        max_ratio: 1,
    });
    assert.equal(qbit.aligned, false);

    const aligned = summarizeQbitAlignment({
        max_seeding_time: QC_CLIENT_RECOMMENDED.qbit.max_seeding_time,
        max_active_torrents: 40,
        max_ratio: 1,
    });
    assert.equal(aligned.aligned, true);
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
