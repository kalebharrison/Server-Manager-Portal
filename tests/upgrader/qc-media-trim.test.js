import test from 'node:test';
import assert from 'node:assert/strict';

import {
    planMkvTrim,
    buildMkvmergeArgs,
    checkTrimOutputSize,
    normalizeLanguageCode,
    parseTrimLanguages,
    resolveNativeLanguage,
    resolveTrimConfig,
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
    assert.equal(resolveNativeLanguage({ originalLanguage: 'ar' }), 'ara');
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
});
