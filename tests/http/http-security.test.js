import assert from 'node:assert/strict';
import test from 'node:test';

import {
    allowSameOriginFrame,
    createSecurityHeadersMiddleware,
    secureTokenEquals,
} from '../../lib/http/http-security.js';

test('secureTokenEquals rejects mismatched and missing secrets', () => {
    assert.equal(secureTokenEquals('abc', 'abc'), true);
    assert.equal(secureTokenEquals('abc', 'abd'), false);
    assert.equal(secureTokenEquals('abc', 'abcd'), false);
    assert.equal(secureTokenEquals('', 'secret'), false);
    assert.equal(secureTokenEquals('secret', ''), false);
    assert.equal(secureTokenEquals(null, 'secret'), false);
});

test('security headers middleware sets baseline browser protections', () => {
    const headers = {};
    const middleware = createSecurityHeadersMiddleware({ forceHsts: true });
    middleware(
        { secure: false, path: '/api/users' },
        { setHeader: (key, value) => { headers[key] = value; } },
        () => {},
    );

    assert.equal(headers['X-Content-Type-Options'], 'nosniff');
    assert.equal(headers['X-Frame-Options'], 'DENY');
    assert.equal(headers['Cache-Control'], 'no-store, private');
    assert.equal(headers['Strict-Transport-Security'], 'max-age=31536000; includeSubDomains');
    assert.match(headers['Content-Security-Policy'], /default-src 'self'/);
});

test('allowSameOriginFrame only relaxes clickjacking headers', () => {
    const headers = {};
    const middleware = createSecurityHeadersMiddleware();
    const res = {
        setHeader: (key, value) => { headers[key] = value; },
        getHeader: (key) => headers[key],
    };
    middleware({ secure: false, path: '/api/config/email-previews' }, res, () => {});
    allowSameOriginFrame(res);
    assert.equal(headers['X-Frame-Options'], 'SAMEORIGIN');
    assert.match(headers['Content-Security-Policy'], /frame-ancestors 'self'/);
    assert.doesNotMatch(headers['Content-Security-Policy'], /frame-ancestors 'none'/);
    assert.match(headers['Content-Security-Policy'], /default-src 'self'/);
});
