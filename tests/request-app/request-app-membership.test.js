import assert from 'node:assert/strict';
import test from 'node:test';

import { createRequestAppService } from '../../lib/request-app/request-app-service.js';

const createService = ({ fetchImpl }) => createRequestAppService({
    fetchWithTimeout: fetchImpl,
    resolveIntegrationUrlForFetch: (value) => String(value || '').replace(/\/+$/, ''),
    log: () => {},
});

const seerrConfig = {
    requestAppType: 'seerr',
    requestAppUrl: 'http://seerr.local',
    requestAppApiKey: 'test-key',
    mediaServerType: 'plex',
};

test('ensureRequestAppUser no-ops when membership sync is disabled', async () => {
    const calls = [];
    const service = createService({
        fetchImpl: async (url) => {
            calls.push(String(url));
            throw new Error(`Unexpected URL ${url}`);
        },
    });
    const result = await service.ensureRequestAppUser({
        ...seerrConfig,
        requestAppMembershipSync: false,
    }, { plexId: '12345', username: 'Viewer' });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'disabled');
    assert.equal(calls.length, 0);
});

test('ensureRequestAppUsers backfills missing active members', async () => {
    const calls = [];
    const service = createService({
        fetchImpl: async (url, options = {}) => {
            calls.push({ url: String(url), method: options.method || 'GET', body: options.body || null });
            if (String(url).includes('/api/v1/user?')) {
                const imported = calls.some((call) => String(call.url).includes('import-from-plex'));
                return {
                    ok: true,
                    status: 200,
                    json: async () => ({
                        results: imported
                            ? [{ id: 9, email: 'viewer@example.com', username: 'Viewer', plexId: 12345 }]
                            : [],
                    }),
                };
            }
            if (String(url).includes('/import-from-plex')) {
                return { ok: true, status: 201, json: async () => ([{ id: 9 }]) };
            }
            throw new Error(`Unexpected URL ${url}`);
        },
    });

    const result = await service.ensureRequestAppUsers(seerrConfig, [
        { plexId: '12345', username: 'Viewer', email: 'viewer@example.com', plexAccessStatus: 'active' },
        { plexId: '999', username: 'Pending', plexAccessStatus: 'pending' },
    ]);
    assert.equal(result.ok, true);
    assert.equal(result.created, 1);
    assert.equal(result.existing, 0);
    assert.ok(calls.some((call) => String(call.url).includes('/import-from-plex')));
});

test('ensureRequestAppUser imports from plex when no Seerr user exists', async () => {
    const calls = [];
    const service = createService({
        fetchImpl: async (url, options = {}) => {
            calls.push({ url: String(url), method: options.method || 'GET', body: options.body || null });
            if (String(url).includes('/api/v1/user?')) {
                const imported = calls.some((call) => String(call.url).includes('import-from-plex'));
                return {
                    ok: true,
                    status: 200,
                    json: async () => ({
                        results: imported
                            ? [{ id: 9, email: 'viewer@example.com', username: 'Viewer', plexId: 12345 }]
                            : [],
                    }),
                };
            }
            if (String(url).includes('/import-from-plex')) {
                return { ok: true, status: 201, json: async () => ([{ id: 9 }]) };
            }
            throw new Error(`Unexpected URL ${url}`);
        },
    });

    const result = await service.ensureRequestAppUser(seerrConfig, {
        plexId: '12345',
        username: 'Viewer',
        email: 'viewer@example.com',
    });

    assert.equal(result.ok, true);
    assert.equal(result.userId, 9);
    assert.equal(result.created, true);
    assert.ok(calls.some((call) => String(call.url).includes('/import-from-plex')));
    const importCall = calls.find((call) => String(call.url).includes('/import-from-plex'));
    assert.deepEqual(JSON.parse(importCall.body), { plexIds: ['12345'] });
});

test('removeRequestAppUser deletes matched Seerr user and skips admin id 1', async () => {
    const deleted = [];
    const service = createService({
        fetchImpl: async (url, options = {}) => {
            if (String(url).includes('/api/v1/user?')) {
                return {
                    ok: true,
                    status: 200,
                    json: async () => ({
                        results: [
                            { id: 1, email: 'admin@example.com', username: 'Admin', plexId: 1 },
                            { id: 4, email: 'viewer@example.com', username: 'Viewer', plexId: 12345 },
                        ],
                    }),
                };
            }
            if (String(url).includes('/api/v1/user/') && (options.method || 'GET') === 'DELETE') {
                deleted.push(String(url));
                return { ok: true, status: 200, json: async () => ({}) };
            }
            throw new Error(`Unexpected URL ${url}`);
        },
    });

    const removed = await service.removeRequestAppUser(seerrConfig, {
        plexId: '12345',
        email: 'viewer@example.com',
        username: 'Viewer',
    });
    assert.equal(removed.ok, true);
    assert.equal(removed.removed, true);
    assert.ok(deleted.some((url) => url.endsWith('/user/4')));

    const protectedAdmin = await service.removeRequestAppUser(seerrConfig, {
        plexId: '1',
        email: 'admin@example.com',
        username: 'Admin',
    });
    assert.equal(protectedAdmin.ok, false);
    assert.equal(protectedAdmin.reason, 'protected_admin');
});
