import assert from 'node:assert/strict';
import test from 'node:test';

import { assertHostnameAllowed } from '../../lib/http/dns-guard.js';

test('dns guard allows private hosts when explicitly permitted', async () => {
    await assert.doesNotReject(() => assertHostnameAllowed('127.0.0.1', { allowPrivate: true }));
});

test('dns guard rejects loopback when private hosts are blocked', async () => {
    await assert.rejects(
        () => assertHostnameAllowed('127.0.0.1', { allowPrivate: false }),
        /Private or local network hosts are not allowed/,
    );
});
