import test from 'node:test';
import assert from 'node:assert/strict';
import {
    filterMissingImportChecks,
    isIntegrityCheckAllowed,
    librariesAllowingNightlyCheck,
    normalizeIntegritySchedulePolicy,
} from '../../lib/upgrader/qc-integrity-schedule-policy.js';
import { missingImportChecks } from '../../lib/upgrader/qc-integrity-recent-imports.js';

test('isIntegrityCheckAllowed defaults missing policy to allow', () => {
    assert.equal(isIntegrityCheckAllowed({}, {
        libraryKey: 'sonarr:tv',
        schedule: 'import',
        check: 'trim',
    }), true);
    assert.equal(isIntegrityCheckAllowed({ qcIntegritySchedulePolicy: {} }, {
        libraryKey: 'sonarr:tv',
        schedule: 'nightly',
        check: 'imohash',
    }), true);
});

test('isIntegrityCheckAllowed honors explicit false and true', () => {
    const config = {
        qcIntegritySchedulePolicy: {
            'sonarr:tv': {
                import: { trim: true, playability: true },
                nightly: { trim: false, imohash: true },
            },
            'sonarr:anime': {
                import: { trim: false },
                nightly: { trim: true },
            },
        },
    };
    assert.equal(isIntegrityCheckAllowed(config, {
        libraryKey: 'sonarr:tv', schedule: 'import', check: 'trim',
    }), true);
    assert.equal(isIntegrityCheckAllowed(config, {
        libraryKey: 'sonarr:tv', schedule: 'nightly', check: 'trim',
    }), false);
    assert.equal(isIntegrityCheckAllowed(config, {
        libraryKey: 'sonarr:anime', schedule: 'import', check: 'trim',
    }), false);
    assert.equal(isIntegrityCheckAllowed(config, {
        libraryKey: 'sonarr:anime', schedule: 'nightly', check: 'trim',
    }), true);
    // Missing check within a schedule row still allows
    assert.equal(isIntegrityCheckAllowed(config, {
        libraryKey: 'sonarr:tv', schedule: 'import', check: 'imohash',
    }), true);
});

test('isIntegrityCheckAllowed blocks xxhash when globally disabled', () => {
    assert.equal(isIntegrityCheckAllowed({ qcIntegrityXxhashEnabled: false }, {
        libraryKey: 'radarr:movies', schedule: 'import', check: 'xxhash',
    }), false);
});

test('filterMissingImportChecks drops disallowed stages', () => {
    const config = {
        qcIntegritySchedulePolicy: {
            'sonarr:anime': { import: { trim: false, playability: true, imohash: true } },
        },
    };
    assert.deepEqual(
        filterMissingImportChecks(['playability', 'trim', 'imohash'], config, 'sonarr:anime'),
        ['playability', 'imohash'],
    );
});

test('missingImportChecks applies import schedule policy', () => {
    const config = {
        qcTrimEnabled: true,
        qcTrimDryRun: false,
        qcIntegritySchedulePolicy: {
            'sonarr:anime': { import: { trim: false, playability: true, imohash: true } },
        },
    };
    const missing = missingImportChecks(null, config, {
        libraryKey: 'sonarr:anime',
        filePath: '/tv/Show.mkv',
        mediaKind: 'video',
    });
    assert.ok(missing.includes('playability'));
    assert.ok(missing.includes('imohash'));
    assert.ok(!missing.includes('trim'));
});

test('librariesAllowingNightlyCheck filters by policy', () => {
    const config = {
        qcIntegritySchedulePolicy: {
            a: { nightly: { trim: true } },
            b: { nightly: { trim: false } },
        },
    };
    const allowed = librariesAllowingNightlyCheck([
        { key: 'a', label: 'A' },
        { key: 'b', label: 'B' },
        { key: 'c', label: 'C' },
    ], config, 'trim');
    assert.deepEqual(allowed.map((lib) => lib.key), ['a', 'c']);
});

test('normalizeIntegritySchedulePolicy strips junk', () => {
    const normalized = normalizeIntegritySchedulePolicy({
        'sonarr:tv': { import: { trim: false, bogus: true }, other: { playability: false } },
        '': { import: { trim: false } },
        bad: null,
    });
    assert.deepEqual(normalized, {
        'sonarr:tv': { import: { trim: false } },
    });
});
