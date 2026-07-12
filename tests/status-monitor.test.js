import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { createDefaultStatusConfig, createPublicStatusPayload, reconcileBuiltInStatusConfig } from '../lib/status-monitor.js';
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

test('status payload abstracts vendor defaults but preserves custom labels', () => {
    const payload = createPublicStatusPayload({
        groups: [{ id: 'downloads', name: 'Automation Health', order: 0 }],
        services: [
            { id: 'sonarr', name: 'Sonarr', description: 'TV automation', groupId: 'downloads' },
            { id: 'radarr', name: 'Cinema Pipeline', description: 'Movie acquisition and upgrades', groupId: 'downloads' },
            { id: 'seerr', name: 'Seerr', description: 'Requests portal', groupId: 'external' },
        ],
    });
    assert.equal(payload.config.groups[0].name, 'Automation Health');
    assert.deepEqual(payload.config.services.map(({ name, description }) => ({ name, description })), [
        { name: 'TV Automation', description: 'TV release automation' },
        { name: 'Cinema Pipeline', description: 'Movie acquisition and upgrades' },
        { name: 'Request Service', description: 'Media requests' },
    ]);
});

test('default status config does not expose the request provider brand', () => {
    const config = createDefaultStatusConfig({ requestAppType: 'seerr', requestAppUrl: 'http://requests:5055' });
    assert.equal(config.services[0].name, 'Request Service');
    assert.equal(config.services[0].description, 'Media requests');
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

test('configured Lidarr is added to status monitoring with member-safe labels', () => {
    const reconciled = reconcileBuiltInStatusConfig({ groups: [], services: [] }, { lidarrUrl: 'http://lidarr:8686', lidarrApiKey: 'secret' });
    const payload = createPublicStatusPayload(reconciled);
    assert.equal(reconciled.services[0].url, 'http://lidarr:8686');
    assert.equal(payload.config.services[0].name, 'Music Automation');
    assert.equal(payload.config.services[0].description, 'Music release automation');
});

test('metadata APIs and additional Arr instances receive distinct status monitors', () => {
    const config = createDefaultStatusConfig({
        tmdbApiKey: 'tmdb-secret',
        tvdbApiKey: 'tvdb-secret',
        arrInstances: [
            { id: 'tv-main', type: 'sonarr', name: 'Sonarr', url: 'http://sonarr:8989', apiKey: 'one', enabled: true, isDefault: true },
            { id: 'tv-anime', type: 'sonarr', name: 'Anime', url: 'http://anime:8989', apiKey: 'two', enabled: true, isDefault: false },
        ],
    });
    assert.deepEqual(config.services.map((service) => service.id), ['sonarr', 'sonarr-tv-anime', 'tmdb', 'tvdb']);
    const payload = createPublicStatusPayload(config);
    assert.deepEqual(payload.config.services.map((service) => service.name), ['TV Automation', 'Anime', 'Media Metadata', 'TV Metadata']);
});

test('Seerr and Ombi can coexist without exposing provider names to members', () => {
    const config = createDefaultStatusConfig({
        requestAppType: 'seerr',
        requestAppUrl: 'http://seerr:5055',
        requestAppApiKey: 'seerr-key',
        ombiUrl: 'http://ombi:3579',
        ombiApiKey: 'ombi-key',
    });
    const payload = createPublicStatusPayload(config);
    assert.deepEqual(payload.config.services.map((service) => service.name), ['Request Service', 'Music Requests']);
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
