import test from 'node:test';
import assert from 'node:assert/strict';
import { isJunkByBlockedExtensions, parseExtensionList } from '../../lib/upgrader/qc-blocked-extensions.js';

test('parseExtensionList strips stars and dots', () => {
    assert.deepEqual(parseExtensionList(['*.exe', '.bat', 'lnk']), ['exe', 'bat', 'lnk']);
});

test('single-file exe torrent name is junk', () => {
    assert.equal(isJunkByBlockedExtensions({
        names: ['House of the Dragon S03E08 1080p HEVC x265-MeGusta.exe'],
        blockedExtensions: ['exe', 'bat', 'lnk'],
    }), true);
});

test('exe beside a real mkv is not junk', () => {
    assert.equal(isJunkByBlockedExtensions({
        names: ['Movie.mkv', 'readme.exe'],
        blockedExtensions: ['exe'],
    }), false);
});

test('rar-only NZB payload is not junk', () => {
    assert.equal(isJunkByBlockedExtensions({
        names: ['release.rar', 'release.par2'],
        blockedExtensions: ['exe', 'bat'],
    }), false);
});

test('empty names or empty blocklist is not junk', () => {
    assert.equal(isJunkByBlockedExtensions({ names: [], blockedExtensions: ['exe'] }), false);
    assert.equal(isJunkByBlockedExtensions({ names: ['a.exe'], blockedExtensions: [] }), false);
});
