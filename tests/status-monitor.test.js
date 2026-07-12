import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { createDefaultStatusConfig, reconcileBuiltInStatusConfig } from '../lib/status-monitor.js';
import { createStatusRuntime, STATUS_HEALTH_SCHEMA_VERSION } from '../lib/status-runtime.js';
import { resolvePlexDiscoveryToken } from '../lib/invite-routes.js';
import { canExposePublicServerStats, canExposePublicStatus } from '../lib/public-status-routes.js';

test('masked Plex discovery credentials resolve to the stored owner token', () => {
    const normalize = (value) => String(value || '').trim();
    assert.equal(resolvePlexDiscoveryToken('••••••••', 'owner-token', '••••••••', normalize), 'owner-token');
    assert.equal(resolvePlexDiscoveryToken('new-token', 'owner-token', '••••••••', normalize), 'new-token');
});

test('login server statistics require explicit public opt-in', () => {
    assert.equal(canExposePublicServerStats({}), false);
    assert.equal(canExposePublicServerStats({ showLoginServerStats: false }), false);
    assert.equal(canExposePublicServerStats({ showLoginServerStats: true }), true);
});

test('status access is private unless public access is explicitly enabled', () => {
    assert.equal(canExposePublicStatus({}), false);
    assert.equal(canExposePublicStatus({ publicStatusEnabled: false }), false);
    assert.equal(canExposePublicStatus({ publicStatusEnabled: true }), false);
    assert.equal(canExposePublicStatus({ publicStatusEnabled: true, publicStatusExplicitlyConfigured: true }), true);
});

test('default status config does not point Plex at the portal URL', () => {
    const config = createDefaultStatusConfig({ publicDomain: 'https://portal.example' });
    assert.equal(config.services.some(service => service.id === 'plex'), false);
});

test('default status config keeps auto-resolved Plex monitor for a selected server', () => {
    const config = createDefaultStatusConfig({ serverIdentifier: 'server-id' });
    assert.equal(config.services.find(service => service.id === 'plex')?.url, '');
});

test('built-in status URLs follow current application settings', () => {
    const stored = {
        groups: [],
        services: [
            { id: 'portal', url: 'https://old.example/api/health' },
            { id: 'plex', url: 'https://old.example' },
            { id: 'custom', url: 'http://custom:8080' },
        ],
    };
    const result = reconcileBuiltInStatusConfig(stored, {
        publicDomain: 'https://old.example',
        plexServerUrl: 'http://plex:32400',
    });
    assert.equal(result.services.find(service => service.id === 'portal').url, 'https://old.example/api/health');
    assert.equal(result.services.find(service => service.id === 'plex').url, 'http://plex:32400');
    assert.equal(result.services.find(service => service.id === 'custom').url, 'http://custom:8080');
});

test('stale generated Plex monitor is removed without a Plex URL', () => {
    const result = reconcileBuiltInStatusConfig({
        groups: [],
        services: [{ id: 'plex', url: 'https://portal.example' }],
    }, { publicDomain: 'https://portal.example' });
    assert.equal(result.services.length, 0);
});

test('legacy status history is cleared instead of treating portal downtime as outages', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'portal-status-'));
    const configPath = path.join(dir, 'config.json');
    const statusPath = path.join(dir, 'status.json');
    const healthPath = path.join(dir, 'health.json');
    const statusConfig = { groups: [{ id: 'core', name: 'Core', order: 0 }], services: [{ id: 'portal', name: 'Portal', url: 'http://portal', groupId: 'core' }] };
    await Promise.all([
        fs.writeFile(configPath, '{}'),
        fs.writeFile(statusPath, JSON.stringify(statusConfig)),
        fs.writeFile(healthPath, JSON.stringify({ _meta: { lastCheck: 1 }, portal: { currentStatus: 'online', uptimePercentage: 0, dailyHistory: { '2026-07-01': { up: 0, down: 100, total: 100 } } } })),
    ]);
    const runtime = createStatusRuntime({
        configPath,
        statusConfigPath: statusPath,
        healthPath,
        loadFile: async (file, fallback) => JSON.parse(await fs.readFile(file, 'utf8').catch(() => JSON.stringify(fallback))),
        saveFile: async (file, value) => fs.writeFile(file, JSON.stringify(value)),
        normalizeExternalBaseUrl: (url) => url,
    });
    await runtime.loadStatusState();
    assert.equal(runtime.getHealthData().portal, undefined);
    assert.equal(runtime.getHealthData()._meta.schemaVersion, STATUS_HEALTH_SCHEMA_VERSION);
    await fs.rm(dir, { recursive: true, force: true });
});
