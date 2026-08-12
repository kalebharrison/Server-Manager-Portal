import test from 'node:test';
import assert from 'node:assert/strict';

import {
    planMkvTrim,
    buildMkvmergeArgs,
    checkTrimOutputSize,
    describeTrimPlan,
    normalizeLanguageCode,
    parseTrimLanguages,
    resolveNativeLanguage,
    resolveTrimConfig,
    trimProfileKey,
    MIN_OUTPUT_RATIO,
} from '../../lib/upgrader/qc-media-trim.js';

const track = (id, type, extra = {}) => ({
    id,
    type,
    properties: {
        language: extra.language,
        language_ietf: extra.ietf,
        track_name: extra.name,
        audio_channels: extra.channels,
    },
});

const infoFrom = (tracks, title = '') => ({
    container: { properties: { title } },
    tracks,
});

test('normalizeLanguageCode maps TMDB ja and IETF en-US', () => {
    assert.equal(normalizeLanguageCode('ja'), 'jpn');
    assert.equal(normalizeLanguageCode('en-US'), 'eng');
    assert.equal(normalizeLanguageCode('ara'), 'ara');
    assert.equal(normalizeLanguageCode('fra'), 'fre');
    assert.equal(normalizeLanguageCode('und'), null);
});

test('parseTrimLanguages defaults to eng+ara', () => {
    assert.deepEqual(parseTrimLanguages(''), ['eng', 'ara']);
    assert.deepEqual(parseTrimLanguages('eng,ara'), ['eng', 'ara']);
});

test('plan keeps eng+ara+native jpn and drops extra audio', () => {
    const plan = planMkvTrim(infoFrom([
        track(0, 'video', { language: 'und' }),
        track(1, 'audio', { language: 'eng', channels: 6 }),
        track(2, 'audio', { language: 'jpn', channels: 6 }),
        track(3, 'audio', { language: 'ger', channels: 2 }),
        track(4, 'subtitles', { language: 'eng' }),
        track(5, 'subtitles', { language: 'ger' }),
    ]), { languages: ['eng', 'ara'], nativeLanguage: 'ja' });

    assert.equal(plan.alreadyClean, false);
    assert.deepEqual(plan.audioKeep.sort((a, b) => a - b), [1, 2]);
    assert.deepEqual(plan.audioDrop, [3]);
    assert.deepEqual(plan.subKeep, [4]);
    assert.deepEqual(plan.subDrop, [5]);
});

test('commentary audio is stripped when other audio remains', () => {
    const plan = planMkvTrim(infoFrom([
        track(0, 'video'),
        track(1, 'audio', { language: 'eng', name: 'English', channels: 6 }),
        track(2, 'audio', { language: 'eng', name: 'Director Commentary', channels: 2 }),
    ]), { languages: ['eng', 'ara'] });
    assert.deepEqual(plan.audioKeep, [1]);
    assert.deepEqual(plan.audioDrop, [2]);
});

test('audio fallback keeps all when no language matches', () => {
    const plan = planMkvTrim(infoFrom([
        track(0, 'video'),
        track(1, 'audio', { language: 'ger', channels: 6 }),
        track(2, 'audio', { language: 'spa', channels: 2 }),
    ]), { languages: ['eng', 'ara'] });
    assert.equal(plan.audioFallbackFired, true);
    assert.deepEqual(plan.audioKeep.sort((a, b) => a - b), [1, 2]);
    assert.deepEqual(plan.audioDrop, []);
    assert.equal(plan.alreadyClean, true);
});

test('lower-channel dupes drop per language', () => {
    const plan = planMkvTrim(infoFrom([
        track(0, 'video'),
        track(1, 'audio', { language: 'eng', channels: 8 }),
        track(2, 'audio', { language: 'eng', channels: 2 }),
        track(3, 'audio', { language: 'ara', channels: 6 }),
    ]), { languages: ['eng', 'ara'] });
    assert.deepEqual(plan.audioKeep.sort((a, b) => a - b), [1, 3]);
    assert.deepEqual(plan.audioDrop, [2]);
});

test('size guard rejects half-or-less remuxes', () => {
    assert.equal(checkTrimOutputSize(1000, 499).ok, false);
    assert.equal(checkTrimOutputSize(1000, 500).ok, true);
    assert.equal(MIN_OUTPUT_RATIO, 0.5);
});

test('describeTrimPlan labels keep and drop tracks', () => {
    const plan = planMkvTrim(infoFrom([
        track(0, 'video'),
        track(1, 'audio', { language: 'eng', name: 'English', channels: 6 }),
        track(2, 'audio', { language: 'eng', name: 'Director Commentary', channels: 2 }),
        track(3, 'subtitles', { language: 'eng', name: 'English' }),
        track(4, 'subtitles', { language: 'ger', name: 'German' }),
    ]), { languages: ['eng', 'ara'] });
    const described = describeTrimPlan(plan);
    assert.match(described.detail, /keep audio \[1 eng English 6ch\]/);
    assert.match(described.detail, /drop audio \[2 eng Director Commentary 2ch\]/);
    assert.deepEqual(described.subKeep, ['3 eng English']);
    assert.deepEqual(described.subDrop, ['4 ger German']);
});

test('buildMkvmergeArgs skips already-clean files', () => {
    const plan = planMkvTrim(infoFrom([
        track(0, 'video'),
        track(1, 'audio', { language: 'eng', channels: 6 }),
    ]), { languages: ['eng', 'ara'] });
    assert.equal(plan.alreadyClean, true);
    assert.equal(buildMkvmergeArgs('/in.mkv', '/out.mkv', plan), null);
});

test('resolveNativeLanguage reads Arr originalLanguage objects', () => {
    assert.equal(resolveNativeLanguage({ originalLanguage: { id: 'ja' } }), 'jpn');
    assert.equal(resolveNativeLanguage({ originalLanguage: { id: 8, name: 'Japanese' } }), 'jpn');
    assert.equal(resolveNativeLanguage({ originalLanguage: 'ar' }), 'ara');
    assert.equal(resolveNativeLanguage({ libraryBucket: 'anime' }), null);
    assert.equal(resolveNativeLanguage({
        originalLanguage: { id: 1, name: 'English' },
        libraryBucket: 'anime',
    }), 'eng');
});

test('resolveTrimConfig keeps jpn native from metadata code', () => {
    const cfg = resolveTrimConfig(
        { qcTrimEnabled: true },
        { originalLanguage: 'jpn' },
    );
    assert.equal(cfg.nativeLanguage, 'jpn');
    const plan = planMkvTrim(infoFrom([
        track(0, 'video'),
        track(1, 'audio', { language: 'jpn', channels: 6 }),
        track(2, 'audio', { language: 'eng', channels: 6 }),
        track(3, 'subtitles', { language: 'eng' }),
        track(4, 'subtitles', { language: 'jpn', name: 'Japanese (SDH)' }),
    ]), cfg);
    assert.deepEqual(plan.audioKeep.sort((a, b) => a - b), [1, 2]);
    assert.deepEqual(plan.audioDrop, []);
    assert.deepEqual(plan.subKeep.sort((a, b) => a - b), [3, 4]);
});

test('trimProfileKey is stable for keep-rules and native language', () => {
    assert.equal(
        trimProfileKey({ languages: ['ara', 'eng'], nativeLanguage: 'ja' }),
        trimProfileKey({ languages: ['eng', 'ara'], nativeLanguage: 'jpn' }),
    );
    assert.notEqual(
        trimProfileKey({ languages: ['eng', 'ara'] }),
        trimProfileKey({ languages: ['eng'] }),
    );
});

test('resolveTrimConfig only rewrites with auto-fix and dry-run off', () => {
    assert.equal(resolveTrimConfig({ qcTrimEnabled: true }).dryRun, true);
    assert.equal(resolveTrimConfig({
        qcTrimEnabled: true,
        qcIntegrityAutomationEnabled: true,
    }).dryRun, true);
    assert.equal(resolveTrimConfig({
        qcTrimEnabled: true,
        qcIntegrityAutomationEnabled: true,
        qcTrimDryRun: false,
    }).dryRun, false);
    assert.equal(resolveTrimConfig({
        qcTrimEnabled: true,
        qcTrimDryRun: true,
    }, {}, { forceRewrite: true }).dryRun, false);
    assert.equal(resolveTrimConfig({
        qcTrimEnabled: true,
        qcIntegrityAutomationEnabled: true,
        qcTrimDryRun: false,
    }, {}, { forceDryRun: true }).dryRun, true);
    assert.equal(resolveTrimConfig({
        qcTrimEnabled: true,
        qcTrimAllowRemux: false,
        qcIntegrityAutomationEnabled: true,
        qcTrimDryRun: false,
    }).dryRun, true);
    assert.equal(resolveTrimConfig({
        qcTrimEnabled: true,
        qcTrimAllowRemux: true,
    }).dryRun, false);
});

test('isCorruptMatroskaProbe catches EBML damage and repeated duplicates', async () => {
    const { isCorruptMatroskaProbe, preflightMkvContainer, probeMkvInfo } = await import('../../lib/upgrader/qc-media-trim.js');
    assert.equal(isCorruptMatroskaProbe(''), false);
    assert.equal(isCorruptMatroskaProbe('[matroska] Duplicate element\n'), false);
    assert.equal(isCorruptMatroskaProbe('[matroska] Duplicate element\nDuplicate element\n'), true);
    assert.equal(
        isCorruptMatroskaProbe('0x00 at pos 6661 (0x1a05) invalid as first byte of an EBML number'),
        true,
    );

    const corrupt = await preflightMkvContainer('/x.mkv', {
        execImpl: async () => ({
            ok: true,
            stdout: '{}',
            stderr: 'invalid as first byte of an EBML number\nDuplicate element\nDuplicate element\n',
        }),
    });
    assert.equal(corrupt.ok, false);
    assert.equal(corrupt.reason, 'trim_container_corrupt');

    const probed = await probeMkvInfo('/x.mkv', {
        execImpl: async (bin) => {
            if (bin === 'ffprobe') {
                return {
                    ok: true,
                    stdout: '{}',
                    stderr: 'Element at 0x45 ending at 0x34e05 exceeds containing master element ending at 0x13f1',
                };
            }
            throw new Error('mkvmerge should not run');
        },
    });
    assert.equal(probed.ok, false);
    assert.equal(probed.reason, 'trim_container_corrupt');
});

test('cleanupPortalTrimTmps removes only portal-trim tmp siblings', async () => {
    const fs = await import('node:fs/promises');
    const os = await import('node:os');
    const path = await import('node:path');
    const { cleanupPortalTrimTmps, portalTrimTmpPathFor, isPortalTrimTmpName } = await import('../../lib/upgrader/qc-media-trim.js');

    assert.equal(isPortalTrimTmpName('Movie.mkv.portal-trim.tmp.mkv'), true);
    assert.equal(isPortalTrimTmpName('Movie.mkv'), false);
    assert.equal(
        portalTrimTmpPathFor('/media/movies/Movie.mkv'),
        '/media/movies/Movie.mkv.portal-trim.tmp.mkv',
    );

    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'portal-trim-tmp-'));
    const nested = path.join(root, 'nested');
    await fs.mkdir(nested);
    const keep = path.join(nested, 'Movie.mkv');
    const orphan = portalTrimTmpPathFor(keep);
    const other = path.join(nested, 'notes.tmp.mkv');
    await fs.writeFile(keep, 'keep');
    await fs.writeFile(orphan, 'orphan');
    await fs.writeFile(other, 'other');

    const result = await cleanupPortalTrimTmps({ roots: [root] });
    assert.equal(result.removed, 1);
    await assert.rejects(() => fs.stat(orphan));
    assert.equal((await fs.readFile(keep, 'utf8')), 'keep');
    assert.equal((await fs.readFile(other, 'utf8')), 'other');
    await fs.rm(root, { recursive: true, force: true });
});

test('trim remux concurrency gate serializes overlapping remuxes', async () => {
    const {
        configureTrimRemuxConcurrency,
        normalizeTrimRemuxConcurrency,
        resetTrimRemuxGateForTests,
        trimMkvFile,
    } = await import('../../lib/upgrader/qc-media-trim.js');

    assert.equal(normalizeTrimRemuxConcurrency(99), 2);
    assert.equal(normalizeTrimRemuxConcurrency(0), 1);
    resetTrimRemuxGateForTests();
    configureTrimRemuxConcurrency(1);

    let inFlight = 0;
    let maxInFlight = 0;
    const mkvInfo = JSON.stringify({
        container: { properties: {} },
        tracks: [
            { id: 0, type: 'video', properties: {} },
            { id: 1, type: 'audio', properties: { language: 'eng', audio_channels: 6 } },
            { id: 2, type: 'audio', properties: { language: 'ger', audio_channels: 2 } },
        ],
    });
    const fs = await import('node:fs/promises');
    const os = await import('node:os');
    const path = await import('node:path');
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'portal-remux-gate-'));
    const fileA = path.join(dir, 'A.mkv');
    const fileB = path.join(dir, 'B.mkv');
    await fs.writeFile(fileA, Buffer.alloc(1000));
    await fs.writeFile(fileB, Buffer.alloc(1000));

    const execImpl = async (bin, args = []) => {
        if (bin === 'ffprobe') return { ok: true, stdout: '{}', stderr: '' };
        if (bin === 'mkvmerge' && args.includes('-J')) {
            return { ok: true, stdout: mkvInfo, stderr: '' };
        }
        if (bin === 'mkvmerge') {
            inFlight += 1;
            maxInFlight = Math.max(maxInFlight, inFlight);
            await new Promise((r) => setTimeout(r, 40));
            const outIdx = args.indexOf('-o');
            if (outIdx >= 0) await fs.writeFile(args[outIdx + 1], Buffer.alloc(800));
            inFlight -= 1;
            return { ok: true, stdout: '', stderr: '' };
        }
        return { ok: true, stdout: '', stderr: '' };
    };

    await Promise.all([
        trimMkvFile(fileA, { dryRun: false, remuxConcurrency: 1, execImpl }),
        trimMkvFile(fileB, { dryRun: false, remuxConcurrency: 1, execImpl }),
    ]);
    assert.equal(maxInFlight, 1);
    await fs.rm(dir, { recursive: true, force: true });
    resetTrimRemuxGateForTests();
});
