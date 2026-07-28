import assert from 'node:assert/strict';
import test from 'node:test';

import { extractMediaDisplayTags } from '../../lib/plex/plex-media-tags.js';
import { audioTagFromParts } from '../../lib/portal-request/arrDisplayTags.js';

test('audioTagFromParts ranks Atmos over TrueHD and covers common codecs', () => {
    assert.equal(audioTagFromParts('TrueHD Atmos'), 'Atmos');
    assert.equal(audioTagFromParts('truehd'), 'TrueHD');
    assert.equal(audioTagFromParts('DTS-HD MA'), 'DTS-HD');
    assert.equal(audioTagFromParts('DTS'), 'DTS');
    assert.equal(audioTagFromParts('EAC3'), 'EAC3');
    assert.equal(audioTagFromParts('aac'), 'AAC');
});

test('extractMediaDisplayTags is resolution + tone + audio (no video codec)', () => {
    const dtsHd = extractMediaDisplayTags({
        Media: [{
            videoResolution: '1080',
            videoCodec: 'hevc',
            Part: [{
                Stream: [
                    { streamType: 1, codec: 'hevc' },
                    { streamType: 2, codec: 'dca', displayTitle: 'DTS-HD MA 7.1', extendedTitle: 'English (DTS-HD MA 7.1)' },
                ],
            }],
        }],
    });
    assert.deepEqual(dtsHd, ['1080p', 'SDR', 'DTS-HD']);

    const dvAtmos = extractMediaDisplayTags({
        Media: [{
            videoResolution: '4k',
            Part: [{
                Stream: [
                    { streamType: 1, codec: 'hevc', displayTitle: '4K Dolby Vision', colorTrc: 'smpte2084' },
                    { streamType: 2, codec: 'truehd', displayTitle: 'TrueHD Atmos 7.1' },
                ],
            }],
        }],
    });
    assert.ok(dvAtmos.includes('4K'), dvAtmos.join(','));
    assert.ok(dvAtmos.includes('DV/HDR') || dvAtmos.includes('DV'), dvAtmos.join(','));
    assert.ok(dvAtmos.includes('Atmos'), dvAtmos.join(','));
    assert.ok(!dvAtmos.includes('HEVC'), dvAtmos.join(','));
});
