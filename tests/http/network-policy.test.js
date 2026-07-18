import assert from 'node:assert/strict';
import test from 'node:test';

import {
    isBlockedHostName,
    isPrivateIp,
    normalizeExternalBaseUrl,
    resolveIntegrationUrlForFetch,
} from '../../lib/http/network-policy.js';

test('private and blocked hosts are detected for SSRF guards', () => {
    assert.equal(isPrivateIp('10.0.0.8'), true);
    assert.equal(isPrivateIp('192.168.1.20'), true);
    assert.equal(isPrivateIp('172.16.4.2'), true);
    assert.equal(isPrivateIp('8.8.8.8'), false);
    assert.equal(isBlockedHostName('localhost'), true);
    assert.equal(isBlockedHostName('seerr.local'), true);
    assert.equal(isBlockedHostName('seerr.example.com'), false);
});

test('normalizeExternalBaseUrl requires allowPrivate for LAN hosts', () => {
    assert.throws(
        () => normalizeExternalBaseUrl('http://192.168.1.50:5055'),
        /Private or local network hosts are not allowed/,
    );
    assert.equal(
        normalizeExternalBaseUrl('http://192.168.1.50:5055/', { allowPrivate: true }),
        'http://192.168.1.50:5055',
    );
    assert.equal(
        resolveIntegrationUrlForFetch('http://seerr:5055/'),
        'http://seerr:5055',
    );
});
