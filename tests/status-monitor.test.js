import assert from 'node:assert/strict';
import test from 'node:test';

import { createDefaultStatusConfig, reconcileBuiltInStatusConfig } from '../lib/status-monitor.js';

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
