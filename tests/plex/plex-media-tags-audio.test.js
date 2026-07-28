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

test('extractMediaDisplayTags includes non-Atmos audio chips', () => {
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
    assert.ok(dtsHd.includes('DTS-HD'), dtsHd.join(','));
    assert.ok(!dtsHd.includes('Atmos'), dtsHd.join(','));

    const aac = extractMediaDisplayTags({
        Media: [{
            videoResolution: '720',
            videoCodec: 'h264',
            Part: [{
                Stream: [
                    { streamType: 1, codec: 'h264' },
                    { streamType: 2, codec: 'aac', displayTitle: 'AAC 2.0' },
                ],
            }],
        }],
    });
    assert.ok(aac.includes('AAC'), aac.join(','));
});
