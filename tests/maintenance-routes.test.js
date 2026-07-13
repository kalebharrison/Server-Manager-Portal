import assert from 'node:assert/strict';
import test from 'node:test';

import { registerMaintenanceRoutes } from '../lib/maintenance-routes.js';

const createResponse = () => ({
    code: 200,
    status(code) {
        this.code = code;
        return this;
    },
    json(body) {
        this.body = body;
        return this;
    },
});

const createHarness = (overrides = {}) => {
    const routes = new Map();
    const middleware = [];
    const requireAdmin = () => {};
    const files = new Map([
        ['config.json', { maintenanceExperimentalEnabled: true }],
        ['rules.json', []],
        ['media-index.json', { generatedAt: null, itemCount: 0, items: [] }],
        ['request-index.json', { generatedAt: null, items: [] }],
        ['preferences.json', {}],
        ['runs.json', []],
    ]);
    const cache = new Map();
    const app = {
        use(path, ...handlers) {
            middleware.push({ path, handlers });
        },
        get(path, ...handlers) {
            routes.set(`GET ${path}`, handlers.at(-1));
        },
        post(path, ...handlers) {
            routes.set(`POST ${path}`, handlers.at(-1));
        },
    };
    const maintenanceService = {
        MAINTENANCE_PREFS_DEFAULTS: {
            global: {
                dryRunByDefault: true,
                maxActionsPerRun: 10,
                requireConfirmForDestructive: true,
            },
        },
        MAINTENANCE_FILTER_CATALOG: [],
        maintenanceRunState: { running: false },
        isMaintenanceExperimentalEnabled: (config) => config.maintenanceExperimentalEnabled === true,
        loadMaintenancePreferences: async () => files.get('preferences.json'),
        applyMaintenanceExclusions: (items) => items,
        sanitizeMaintenanceRuleForPersist: (rule) => {
            const cleaned = { ...rule };
            delete cleaned._resetGrace;
            return cleaned;
        },
        getMaintenanceSettings: (rule) => rule.settings || {},
        buildMaintenancePreviewForRule: () => ({}),
        evaluateMaintenanceRule: () => false,
        getArrCatalog: async () => ({ radarr: [], sonarr: [] }),
        validateMaintenanceDestructivePreflight: async () => ({}),
        buildMaintenanceMediaIndex: async () => ({ generatedAt: null, itemCount: 0, requestItemCount: 0 }),
        executeMaintenanceRunBatch: async () => [],
    };

    const options = {
        app,
        requireAdmin,
        configPath: 'config.json',
        maintenanceRulesPath: 'rules.json',
        maintenanceMediaIndexPath: 'media-index.json',
        maintenanceRequestIndexPath: 'request-index.json',
        maintenancePrefsPath: 'preferences.json',
        maintenanceRunsPath: 'runs.json',
        loadFile: async (path, fallback) => files.has(path) ? files.get(path) : fallback,
        saveFile: async (path, value) => files.set(path, value),
        appendAuditLog: async () => {},
        maintenanceService,
        tasksInfo: [],
        markTaskStart: () => {},
        markTaskEnd: () => {},
        withCache: (key, ttlMs, fetcher) => {
            if (!cache.has(key)) cache.set(key, fetcher());
            return cache.get(key);
        },
        ...overrides,
    };

    registerMaintenanceRoutes(options);
    return { cache, files, middleware, requireAdmin, routes };
};

test('registerMaintenanceRoutes preserves the maintenance route surface and feature middleware', async () => {
    const harness = createHarness();

    assert.deepEqual([...harness.routes.keys()].sort(), [
        'GET /api/maintenance/exclusions/summary',
        'GET /api/maintenance/filter-options',
        'GET /api/maintenance/index',
        'GET /api/maintenance/library-items',
        'GET /api/maintenance/preferences',
        'GET /api/maintenance/rules',
        'GET /api/maintenance/runs',
        'GET /api/maintenance/storage-summary',
        'POST /api/maintenance/index/rebuild',
        'POST /api/maintenance/preferences',
        'POST /api/maintenance/preflight',
        'POST /api/maintenance/preview',
        'POST /api/maintenance/rules',
        'POST /api/maintenance/rules/reset-grace',
        'POST /api/maintenance/run',
    ]);
    assert.equal(harness.middleware.length, 1);
    assert.equal(harness.middleware[0].path, '/api/maintenance');
    assert.equal(harness.middleware[0].handlers[0], harness.requireAdmin);

    const featureMiddleware = harness.middleware[0].handlers[1];
    let nextCalled = false;
    await featureMiddleware({}, createResponse(), () => { nextCalled = true; });
    assert.equal(nextCalled, true);

    harness.files.set('config.json', { maintenanceExperimentalEnabled: false });
    const disabledResponse = createResponse();
    await featureMiddleware({}, disabledResponse, () => {});
    assert.equal(disabledResponse.code, 403);
});

test('rule mutations invalidate cached reads after route extraction', async () => {
    const harness = createHarness();
    harness.files.set('rules.json', [{
        id: 'rule-1',
        name: 'Old name',
        graceDays: 2,
        createdAt: '2026-01-01T00:00:00.000Z',
    }]);

    const readRules = harness.routes.get('GET /api/maintenance/rules');
    const saveRules = harness.routes.get('POST /api/maintenance/rules');
    const firstRead = createResponse();
    await readRules({}, firstRead);
    assert.equal(firstRead.body[0].name, 'Old name');

    const saveResponse = createResponse();
    await saveRules({
        body: [{ id: 'rule-1', name: 'New name', graceDays: 3 }],
        user: { id: 'admin' },
    }, saveResponse);
    assert.equal(saveResponse.code, 200);

    const secondRead = createResponse();
    await readRules({}, secondRead);
    assert.equal(secondRead.body[0].name, 'New name');
    assert.equal(secondRead.body[0].createdAt, '2026-01-01T00:00:00.000Z');
    assert.deepEqual([...harness.cache.keys()].map((key) => key.split(':')[1]), ['0', '1']);
});
