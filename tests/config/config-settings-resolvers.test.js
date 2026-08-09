import assert from 'node:assert/strict';
import test from 'node:test';

import { createResolveSecret } from '../../lib/config/config-settings-resolvers.js';

test('resolveSecret keeps the stored value when the form sends a blank or mask', () => {
    const resolveSecret = createResolveSecret('********');
    assert.equal(resolveSecret('********', 'real-pass'), 'real-pass');
    assert.equal(resolveSecret('', 'real-pass'), 'real-pass');
    assert.equal(resolveSecret(undefined, 'real-pass'), 'real-pass');
    assert.equal(resolveSecret('new-pass', 'real-pass'), 'new-pass');
    assert.equal(resolveSecret('', ''), '');
});
