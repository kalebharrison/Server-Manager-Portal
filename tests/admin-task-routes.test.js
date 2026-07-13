import assert from 'node:assert/strict';
import test from 'node:test';

import { registerAdminTaskRoutes } from '../lib/admin-task-routes.js';

test('manual task execution claims a task before responding', async () => {
    let handler;
    let release;
    const task = { id: 'plexStats', name: 'Plex Stats', running: false };
    registerAdminTaskRoutes({
        app: { get() {}, post(_path, ...handlers) { handler = handlers.at(-1); } },
        requireAdmin() {},
        configPath: 'config.json',
        loadFile: async () => ({}),
        getTasksSnapshot: () => [],
        findRunnableTask: () => ({ task, kind: 'system' }),
        markTaskStart: (value) => { value.running = true; },
        markTaskEnd: (value) => { value.running = false; },
        buildPlexStatsCache: () => new Promise((resolve) => { release = resolve; }),
        log() {},
    });
    const response = () => ({
        code: 200,
        status(code) { this.code = code; return this; },
        json(value) { this.body = value; return this; },
    });
    const first = response();
    handler({ params: { taskId: 'plexStats' }, user: {} }, first);
    const second = response();
    handler({ params: { taskId: 'plexStats' }, user: {} }, second);

    assert.equal(first.code, 200);
    assert.equal(second.code, 400);
    await Promise.resolve();
    release();
    await Promise.resolve();
});
