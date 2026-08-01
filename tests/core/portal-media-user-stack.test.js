import assert from 'node:assert/strict';
import test from 'node:test';

import { createPortalMediaUserStack } from '../../lib/core/portal-media-stack.js';

test('createPortalMediaUserStack requires resolveIntegrationUrlForFetch', () => {
    assert.throws(
        () => createPortalMediaUserStack({
            loadFile: async () => ({}),
            saveFile: async () => {},
            apiFetch: async () => ({}),
            fetchWithTimeout: async () => ({}),
            jellyfinHeaders: () => ({}),
            withBasePath: (value) => value,
            appendAuditLog: async () => {},
            sendExpiryEmail: async () => {},
            isDeletedUser: () => false,
            log: () => {},
        }),
        /requires resolveIntegrationUrlForFetch/,
    );
});

test('createPortalMediaUserStack wires media user service with resolver', () => {
    const stack = createPortalMediaUserStack({
        loadFile: async () => ({}),
        saveFile: async () => {},
        apiFetch: async () => ({}),
        fetchWithTimeout: async () => ({}),
        jellyfinHeaders: () => ({}),
        withBasePath: (value) => value,
        appendAuditLog: async () => {},
        sendExpiryEmail: async () => {},
        isDeletedUser: () => false,
        resolveIntegrationUrlForFetch: async (url) => url,
        log: () => {},
    });
    assert.equal(typeof stack.syncUsers, 'function');
    assert.equal(typeof stack.syncJellyfinUsers, 'function');
    assert.equal(typeof stack.inviteUserToPlex, 'function');
    assert.equal(typeof stack.checkAndRevoke, 'function');
});
