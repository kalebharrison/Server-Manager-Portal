import assert from 'node:assert/strict';
import test from 'node:test';

import { sanitizeAssetUrl, sanitizeHttpUrl, sanitizePublicDomain } from '../../lib/http/public-url.js';

test('sanitizeHttpUrl allows only http(s)', () => {
    assert.equal(sanitizeHttpUrl('https://example.com/path'), 'https://example.com/path');
    assert.throws(() => sanitizeHttpUrl('javascript:alert(1)', { allowEmpty: false }), /must use http or https/);
    assert.throws(() => sanitizeHttpUrl('data:text/html,hi', { allowEmpty: false }), /must use http or https/);
});

test('sanitizeAssetUrl allows relative portal paths and http(s)', () => {
    assert.equal(sanitizeAssetUrl('/static/logo.png'), '/static/logo.png');
    assert.equal(sanitizeAssetUrl('https://cdn.example.com/a.png'), 'https://cdn.example.com/a.png');
    assert.throws(() => sanitizeAssetUrl('//evil.example/x'), /must use http or https|Invalid/);
    assert.throws(() => sanitizeAssetUrl('javascript:alert(1)'), /must use http or https/);
});

test('sanitizePublicDomain normalizes trailing slashes', () => {
    assert.equal(sanitizePublicDomain('https://portal.example.com/'), 'https://portal.example.com');
    assert.equal(sanitizePublicDomain(''), 'https://portal.yourdomain.com');
});
