import assert from 'node:assert/strict';
import test from 'node:test';

import { getReadyArrInstances, normalizeArrConfig, sanitizeArrInstances } from '../lib/arr-instances.js';

test('legacy Arr settings migrate and additional instances preserve one default', () => {
    const migrated = normalizeArrConfig({ sonarrUrl: 'http://sonarr', sonarrApiKey: 'legacy-key' });
    assert.equal(migrated.arrInstances[0].id, 'sonarr-default');
    assert.equal(migrated.sonarrApiKey, 'legacy-key');

    const instances = sanitizeArrInstances([
        { id: 'one', type: 'sonarr', name: 'Main', url: 'http://one', apiKey: 'one', isDefault: true },
        { id: 'two', type: 'sonarr', name: 'Anime', url: 'http://two', apiKey: 'two', isDefault: true },
        { id: 'music', type: 'lidarr', name: 'Music', url: 'http://music', apiKey: 'three', isDefault: false },
    ], {}, { resolveSecret: (value) => value, resolveUrl: (value) => value });
    assert.equal(instances.filter((instance) => instance.type === 'sonarr' && instance.isDefault).length, 1);
    assert.equal(getReadyArrInstances({ arrInstances: instances }, 'sonarr').length, 2);
    assert.equal(getReadyArrInstances({ arrInstances: instances }, 'lidarr').length, 1);
    assert.equal(normalizeArrConfig({ arrInstances: [], sonarrUrl: 'http://legacy', sonarrApiKey: 'legacy' }).arrInstances.length, 0);
});
