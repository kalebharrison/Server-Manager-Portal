import assert from 'node:assert/strict';
import test from 'node:test';

import { createRequireMember, isEligibleMember, registerAuthRoutes } from '../lib/auth-routes.js';
import { createJellyfinAdminResolver, registerJellyfinAuthRoutes } from '../lib/auth-jellyfin-routes.js';

const localDate = (dayOffset) => {
    const date = new Date();
    date.setDate(date.getDate() + dayOffset);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}T12:00:00.000Z`;
};

const createApp = () => {
    const routes = new Map();
    const register = (method) => (path, ...handlers) => routes.set(`${method} ${path}`, handlers.at(-1));
    return {
        routes,
        app: {
            get: register('GET'),
            post: register('POST'),
            put: register('PUT'),
            patch: register('PATCH'),
            delete: register('DELETE'),
        },
    };
};

const createResponse = () => ({
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    redirect(location) { this.redirectLocation = location; return this; },
});

test('member eligibility rejects revoked and expired users but keeps pending unexpired users', () => {
    assert.equal(isEligibleMember({ plexAccessStatus: 'revoked', expiryDate: localDate(10) }), false);
    assert.equal(isEligibleMember({ plexAccessStatus: 'active', expiryDate: localDate(-1) }), false);
    assert.equal(isEligibleMember({ plexAccessStatus: 'pending', expiryDate: localDate(1) }), true);
    assert.equal(isEligibleMember({ plexAccessStatus: 'pending', expiryDate: localDate(0) }), true);
    assert.equal(isEligibleMember({ plexAccessStatus: 'active', expiryDate: null }), true);
});

test('requireMember clears sessions for ineligible local members', async (t) => {
    for (const localUser of [
        { id: 'member', plexAccessStatus: 'revoked', expiryDate: localDate(1) },
        { id: 'member', plexAccessStatus: 'active', expiryDate: localDate(-1) },
    ]) {
        await t.test(localUser.plexAccessStatus === 'revoked' ? 'revoked' : 'expired', async () => {
            let cleared = false;
            let nextCalled = false;
            const middleware = createRequireMember({
                configPath: 'config',
                usersPath: 'users',
                deletedUsersPath: 'deleted',
                loadFile: async (path) => path === 'users' ? [localUser] : path === 'deleted' ? [] : {},
                resolveCurrentAdmin: async () => false,
                findLocalUserForSession: (users) => users[0],
                appendAuditLog: async () => {},
                clearSessionCookie: () => { cleared = true; },
            });
            const response = createResponse();

            await middleware({ user: { id: 'member' } }, response, () => { nextCalled = true; });

            assert.equal(response.statusCode, 403);
            assert.equal(cleared, true);
            assert.equal(nextCalled, false);
        });
    }
});

test('Plex callback login rejects an expired local member', async () => {
    const { app, routes } = createApp();
    let cookieSet = false;
    registerAuthRoutes({
        app,
        authRateLimit: () => {},
        authCallbackRateLimit: () => {},
        jellyfinQuickConnectPollRateLimit: () => {},
        publicReadRateLimit: () => {},
        setupRateLimit: () => {},
        requireAuth: () => {},
        requireMember: () => {},
        requireAdmin: () => {},
        appVersion: 'test',
        configPath: 'config',
        usersPath: 'users',
        deletedUsersPath: 'deleted',
        jwtSecret: 'test-secret',
        forceSecureCookies: false,
        loadFile: async (path) => path === 'users'
            ? [{ id: 'uuid-1', plexId: 'plex-1', plexAccessStatus: 'active', expiryDate: localDate(-1) }]
            : path === 'deleted' ? [] : {},
        saveFile: async () => {},
        apiFetch: async () => ({
            ok: true,
            json: async () => ({ id: 'plex-1', uuid: 'uuid-1', username: 'viewer', email: 'viewer@example.com' }),
        }),
        jellyfinHeaders: () => ({}),
        isJellyfinConfigured: () => false,
        isPortalConfigured: () => true,
        resolveIntegrationUrlForFetch: (value) => value,
        getClientId: () => 'client-id',
        withBasePath: (value) => value,
        clearSessionCookie: () => {},
        setSessionCookie: () => { cookieSet = true; },
        appendAuditLog: async () => {},
        findLocalUserForSession: (users) => users[0] || null,
        syncAdminPlexIdFromConfigToken: async () => {},
        getAdminId: async () => null,
        resolveCurrentAdmin: async () => false,
        resolveConfiguredPlexServerUrl: () => '',
        fetchOwnedPlexServers: async () => [],
        canRunInitialSetup: () => false,
        inviteUserToPlex: async () => {},
        getPlexConnectionUri: async () => '',
        resolveLocalPlexAccountId: async () => '',
        fetchPlexServerAccounts: async () => ({ map: {} }),
        getAdminProfile: async () => ({}),
        log: () => {},
        fetchImpl: async () => ({ json: async () => ({ authToken: 'plex-token' }) }),
    });
    const response = createResponse();

    await routes.get('POST /api/auth/plex/callback')({ body: { pinId: 'pin-1' } }, response);

    assert.equal(response.statusCode, 403);
    assert.equal(cookieSet, false);
});

test('Jellyfin login rejects revoked users and accepts pending unexpired users', async (t) => {
    for (const [label, localUser, expectedStatus] of [
        ['revoked', { id: 'jellyfin:user-1', jellyfinId: 'user-1', plexAccessStatus: 'revoked', expiryDate: localDate(1) }, 403],
        ['pending', { id: 'jellyfin:user-1', jellyfinId: 'user-1', plexAccessStatus: 'pending', expiryDate: localDate(1) }, 200],
    ]) {
        await t.test(label, async () => {
            const { app, routes } = createApp();
            let cookieSet = false;
            registerJellyfinAuthRoutes({
                app,
                authRateLimit: () => {},
                jellyfinQuickConnectPollRateLimit: () => {},
                configPath: 'config',
                usersPath: 'users',
                deletedUsersPath: 'deleted',
                jwtSecret: 'test-secret',
                forceSecureCookies: false,
                loadFile: async (path) => path === 'users' ? [localUser] : path === 'deleted' ? [] : {
                    mediaServerType: 'jellyfin', jellyfinUrl: 'http://jellyfin', jellyfinApiKey: 'api-key',
                },
                saveFile: async () => {},
                jellyfinHeaders: () => ({}),
                isJellyfinConfigured: () => true,
                resolveIntegrationUrlForFetch: (value) => value,
                withBasePath: (value) => value,
                clearSessionCookie: () => {},
                setSessionCookie: () => { cookieSet = true; },
                appendAuditLog: async () => {},
                findLocalUserForSession: (users) => users[0] || null,
                isEligibleMember,
                log: () => {},
                fetchImpl: async () => ({
                    ok: true,
                    json: async () => ({ User: { Id: 'user-1', Name: 'viewer', Policy: { IsAdministrator: false } }, AccessToken: 'token' }),
                }),
            });
            const response = createResponse();

            await routes.get('POST /api/auth/jellyfin/login')({ body: { username: 'viewer', password: 'password' } }, response);

            assert.equal(response.statusCode, expectedStatus);
            assert.equal(cookieSet, expectedStatus === 200);
        });
    }
});

test('Jellyfin admin resolution fails closed and coalesces live lookups', async () => {
    const sessionUser = {
        authProvider: 'jellyfin', jellyfinId: 'admin-1', username: 'admin', jellyfinIsAdmin: true, isAdmin: true,
    };
    const config = { jellyfinUrl: 'http://jellyfin', jellyfinApiKey: 'api-key' };
    const failedResolver = createJellyfinAdminResolver({
        fetchImpl: async () => ({ ok: false, status: 503 }),
        resolveIntegrationUrlForFetch: (value) => value,
        jellyfinHeaders: () => ({}),
        log: () => {},
    });
    assert.equal(await failedResolver(sessionUser, config), false);

    let fetchCalls = 0;
    let releaseFetch;
    const resolver = createJellyfinAdminResolver({
        fetchImpl: async () => {
            fetchCalls += 1;
            await new Promise((resolve) => { releaseFetch = resolve; });
            return { ok: true, json: async () => ({ Policy: { IsAdministrator: true } }) };
        },
        resolveIntegrationUrlForFetch: (value) => value,
        jellyfinHeaders: () => ({}),
        log: () => {},
    });
    const first = resolver(sessionUser, config);
    const second = resolver(sessionUser, config);
    await Promise.resolve();
    assert.equal(fetchCalls, 1);
    releaseFetch();
    assert.deepEqual(await Promise.all([first, second]), [true, true]);
    assert.equal(await resolver(sessionUser, config), true);
    assert.equal(fetchCalls, 1);
});
