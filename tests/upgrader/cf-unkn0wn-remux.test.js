import test from 'node:test';
import assert from 'node:assert/strict';
import {
    FIXED_UNKN0WN_NOREMUX,
    isBrokenUnkn0wnNoRemuxPattern,
    needsUnkn0wnRemuxRepair,
    patchUnkn0wnRemuxFormat,
} from '../../lib/upgrader/cf-unkn0wn-remux.js';

const broken = String.raw`(?<!\b(remux).*?)\b(unkn0wn)\b`;
const title = 'The_Devil_Wears_Prada_2_2026_2160p_UHD_BluRay_DV_REMUX_HDR10_HEVC_TrueHD_7_1_Atmos-UnKn0wn';

test('detects broken UnKn0wn NoRemux lookbehind', () => {
    assert.equal(isBrokenUnkn0wnNoRemuxPattern(broken), true);
    assert.equal(isBrokenUnkn0wnNoRemuxPattern(FIXED_UNKN0WN_NOREMUX), false);
});

test('fixed pattern allows underscore remux titles', () => {
    const brokenRe = new RegExp(broken, 'i');
    const fixedRe = new RegExp(FIXED_UNKN0WN_NOREMUX, 'i');
    assert.equal(brokenRe.test(title), true);
    assert.equal(fixedRe.test(title), false);
    assert.equal(fixedRe.test('Movie.2024.1080p.BluRayRIP.x265-UnKn0wn'), true);
});

test('patchUnkn0wnRemuxFormat rewrites LQ Release Title specs', () => {
    const format = {
        id: 12,
        name: 'LQ (Release Title)',
        specifications: [
            {
                name: 'UnKn0wn (NoRemux)',
                implementation: 'ReleaseTitleSpecification',
                fields: { value: broken },
            },
        ],
    };
    assert.equal(needsUnkn0wnRemuxRepair(format), true);
    const patched = patchUnkn0wnRemuxFormat(format);
    assert.ok(patched);
    assert.equal(patched.specifications[0].fields.value, FIXED_UNKN0WN_NOREMUX);
    assert.equal(needsUnkn0wnRemuxRepair(patched), false);
});
