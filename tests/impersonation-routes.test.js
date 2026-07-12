import assert from 'node:assert/strict';
import test from 'node:test';
import jwt from 'jsonwebtoken';

import { registerImpersonationRoutes } from '../lib/impersonation-routes.js';

test('impersonation uses a short-lived user token and restores the admin actor', async () => {
    const routes = new Map();
    const app = { post(path, ...handlers) { routes.set(path, handlers.at(-1)); } };
    const secret = 'test-secret-test-secret-test-secret';
    const actor = { id: 'admin', plexId: 'admin', username: 'Admin', isAdmin: true };
    const target = { id: 'user-1', plexId: 'user-1', username: 'Viewer', email: 'viewer@example.com' };
    let cookieToken = '';
    const auditEvents = [];
    const loadFile = async (path) => {
        if (path === 'users') return [target];
        if (path === 'deleted') return [];
        return { mediaServerType: 'plex' };
    };

    registerImpersonationRoutes({
        app,
        requireAuth: () => {},
        requireAdmin: () => {},
        configPath: 'config',
        usersPath: 'users',
        deletedUsersPath: 'deleted',
        jwtSecret: secret,
        loadFile,
        setSessionCookie: (_req, _res, token) => { cookieToken = token; },
        appendAuditLog: async (event) => { auditEvents.push(event); },
        resolveCurrentAdmin: async (user) => user.plexId === 'admin',
        log: () => {},
    });

    const response = { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; } };
    await routes.get('/api/admin/impersonate/:userId')({ user: actor, params: { userId: target.id } }, response);
    assert.equal(response.statusCode, 200);
    const impersonated = jwt.verify(cookieToken, secret);
    assert.equal(impersonated.isAdmin, false);
    assert.equal(impersonated.impersonatingUserId, target.id);
    assert.equal(impersonated.actor.id, actor.id);
    assert.ok(impersonated.exp - impersonated.iat <= 3600);

    await routes.get('/api/admin/stop-impersonation')({ user: impersonated }, response);
    const restored = jwt.verify(cookieToken, secret);
    assert.equal(restored.isAdmin, true);
    assert.equal(restored.id, actor.id);
    assert.equal(restored.actor, undefined);
    assert.deepEqual(auditEvents, ['impersonation_start', 'impersonation_stop']);
});
