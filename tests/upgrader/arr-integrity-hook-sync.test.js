import assert from 'node:assert/strict';
import test from 'node:test';

import {
    INTEGRITY_HOOK_NAME,
    applyIntegrityHookPayload,
    buildIntegrityTriggerUrl,
    isIntegrityHookNotification,
    notificationApiBase,
    syncIntegrityHooksToArr,
} from '../../lib/upgrader/arr-integrity-hook-sync.js';

test('trigger URLs and notification API versions', () => {
    assert.equal(
        buildIntegrityTriggerUrl('https://portal.example/', 'sonarr'),
        'https://portal.example/triggers/sonarr',
    );
    assert.equal(notificationApiBase('sonarr'), '/api/v3/notification');
    assert.equal(notificationApiBase('radarr'), '/api/v3/notification');
    assert.equal(notificationApiBase('lidarr'), '/api/v1/notification');
});

test('isIntegrityHookNotification matches name or trigger path', () => {
    assert.equal(isIntegrityHookNotification({ name: 'Portal Integrity' }, 'sonarr'), true);
    assert.equal(isIntegrityHookNotification({
        name: 'Legacy',
        fields: [{ name: 'url', value: 'https://portal.example/triggers/radarr' }],
    }, 'radarr'), true);
    assert.equal(isIntegrityHookNotification({
        name: 'Other',
        fields: [{ name: 'url', value: 'https://discord.com/api/webhooks/1/x' }],
    }, 'sonarr'), false);
});

test('applyIntegrityHookPayload enables import events and writes basic auth', () => {
    const payload = applyIntegrityHookPayload({
        supportsOnDownload: true,
        supportsOnUpgrade: true,
        supportsOnImportComplete: true,
        fields: [{ name: 'url', value: '' }],
    }, {
        url: 'https://portal.example/triggers/sonarr',
        username: 'integrity',
        password: 'secret',
    });
    assert.equal(payload.name, INTEGRITY_HOOK_NAME);
    assert.equal(payload.onGrab, false);
    assert.equal(payload.onDownload, true);
    assert.equal(payload.onUpgrade, true);
    assert.equal(payload.onImportComplete, true);
    assert.equal(payload.fields.find((field) => field.name === 'username').value, 'integrity');
    assert.equal(payload.fields.find((field) => field.name === 'password').value, 'secret');
    assert.equal(payload.fields.find((field) => field.name === 'method').value, 1);
});

test('syncIntegrityHooksToArr creates missing webhooks and updates existing ones', async () => {
    const calls = [];
    const fetchArr = async (instance, endpoint, options = {}) => {
        calls.push({ type: instance.type, endpoint, method: options.method || 'GET', body: options.body || null });
        if (endpoint.endsWith('/schema')) {
            return {
                ok: true,
                status: 200,
                data: [{
                    implementation: 'Webhook',
                    implementationName: 'Webhook',
                    configContract: 'WebhookSettings',
                    supportsOnDownload: true,
                    supportsOnUpgrade: true,
                    fields: [{ name: 'url', value: '' }],
                }],
            };
        }
        if (endpoint === '/api/v3/notification' && (options.method || 'GET') === 'GET') {
            if (instance.type === 'radarr') {
                return {
                    ok: true,
                    status: 200,
                    data: [{
                        id: 9,
                        name: 'Old hook',
                        fields: [{ name: 'url', value: 'https://old.example/triggers/radarr' }],
                    }],
                };
            }
            return { ok: true, status: 200, data: [] };
        }
        return { ok: true, status: 200, data: { id: options.body?.id || 12, ...options.body } };
    };

    const result = await syncIntegrityHooksToArr({
        upgraderEnabled: true,
        qcIntegrityEnabled: true,
        publicDomain: 'https://portal.example',
        qcIntegrityWebhookUsername: 'integrity',
        qcIntegrityWebhookPassword: 'secret',
        arrInstances: [
            { id: 's1', type: 'sonarr', name: 'Sonarr', url: 'http://sonarr.local', apiKey: 'a', enabled: true },
            { id: 'r1', type: 'radarr', name: 'Radarr', url: 'http://radarr.local', apiKey: 'b', enabled: true },
        ],
    }, { fetchArr, test: false });

    assert.equal(result.ok, true);
    assert.equal(result.results[0].action, 'create');
    assert.equal(result.results[1].action, 'update');
    assert.ok(calls.some((call) => call.type === 'sonarr' && call.method === 'POST' && call.endpoint === '/api/v3/notification'));
    assert.ok(calls.some((call) => call.type === 'radarr' && call.method === 'PUT' && call.endpoint === '/api/v3/notification/9'));
    const created = calls.find((call) => call.method === 'POST' && call.body);
    assert.equal(created.body.fields.find((field) => field.name === 'url').value, 'https://portal.example/triggers/sonarr');
});

test('syncIntegrityHooksToArr refuses placeholder public domain', async () => {
    const result = await syncIntegrityHooksToArr({
        upgraderEnabled: true,
        qcIntegrityEnabled: true,
        publicDomain: 'https://portal.yourdomain.com',
        qcIntegrityWebhookUsername: 'integrity',
        qcIntegrityWebhookPassword: 'secret',
        arrInstances: [
            { id: 's1', type: 'sonarr', name: 'Sonarr', url: 'http://sonarr.local', apiKey: 'a', enabled: true },
        ],
    }, { fetchArr: async () => ({ ok: true, data: [] }) });
    assert.equal(result.ok, false);
    assert.match(result.error, /public portal URL/i);
});
