import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCfRepairsForFormats, scanCfRepairsForFormats } from '../../lib/upgrader/cf-repairs.js';
import { BROKEN_UNKN0WN_NOREMUX, FIXED_UNKN0WN_NOREMUX } from '../../lib/upgrader/cf-unkn0wn-remux.js';

test('cf repair catalog detects and patches UnKn0wn remux hole', () => {
    const formats = [{
        id: 30,
        name: 'LQ (Release Title)',
        specifications: [{
            name: 'UnKn0wn (NoRemux)',
            fields: { value: BROKEN_UNKN0WN_NOREMUX },
        }],
    }];
    const scanned = scanCfRepairsForFormats(formats, { type: 'radarr' });
    assert.equal(scanned[0].healthy, false);
    assert.equal(scanned[0].needingCount, 1);
    const repaired = applyCfRepairsForFormats(formats);
    assert.equal(repaired.length, 1);
    assert.equal(repaired[0].format.specifications[0].fields.value, FIXED_UNKN0WN_NOREMUX);
});
