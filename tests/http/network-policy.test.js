import assert from 'node:assert/strict';
import test from 'node:test';

import {
    createResolveIntegrationUrlForFetch,
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
    assert.equal(isPrivateIp('::1'), true);
    assert.equal(isPrivateIp('fc00::1'), true);
    assert.equal(isPrivateIp('fd12:3456:789a::1'), true);
    assert.equal(isPrivateIp('fe80::1'), true);
    assert.equal(isPrivateIp('2001:4860:4860::8888'), false);
    assert.equal(isBlockedHostName('localhost'), true);
    assert.equal(isBlockedHostName('seerr.local'), true);
    assert.equal(isBlockedHostName('seerr.example.com'), false);
});

test('normalizeExternalBaseUrl requires allowPrivate for LAN hosts', async () => {
    assert.throws(
        () => normalizeExternalBaseUrl('http://192.168.1.50:5055'),
        /Private or local network hosts are not allowed/,
    );
    assert.equal(
        normalizeExternalBaseUrl('http://192.168.1.50:5055/', { allowPrivate: true }),
        'http://192.168.1.50:5055',
    );
    assert.equal(
        await resolveIntegrationUrlForFetch('http://seerr:5055/'),
        'http://seerr:5055',
    );
    const strictFetch = createResolveIntegrationUrlForFetch({ allowPrivate: false });
    await assert.rejects(
        () => strictFetch('http://192.168.1.50:5055'),
        /Private or local network hosts are not allowed/,
    );
    // Public hostnames are allowed after DNS validation; LAN literals stay blocked.
    assert.equal(await strictFetch('https://example.com/'), 'https://example.com');
});
