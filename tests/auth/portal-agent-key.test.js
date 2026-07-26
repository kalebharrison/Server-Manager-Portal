import assert from 'node:assert/strict';
import test from 'node:test';

import {
    ensurePortalAgentApiKey,
    generatePortalAgentApiKey,
    readPortalAgentKeyFromRequest,
    tryAttachPortalAgent,
} from '../../lib/auth/portal-agent-key.js';

test('generatePortalAgentApiKey returns a long hex secret', () => {
    const key = generatePortalAgentApiKey();
    assert.match(key, /^[a-f0-9]{64}$/);
    assert.notEqual(key, generatePortalAgentApiKey());
});

test('ensurePortalAgentApiKey creates and persists when missing', async () => {
    let saved = null;
    const outcome = await ensurePortalAgentApiKey({}, {
        save: async (next) => { saved = next; },
    });
    assert.equal(outcome.created, true);
    assert.match(outcome.key, /^[a-f0-9]{64}$/);
    assert.equal(saved.portalAgentApiKey, outcome.key);
});

test('ensurePortalAgentApiKey keeps an existing key', async () => {
    let saved = false;
    const outcome = await ensurePortalAgentApiKey({ portalAgentApiKey: 'existing-key-value-0123456789abcdef' }, {
        save: async () => { saved = true; },
    });
    assert.equal(outcome.created, false);
    assert.equal(outcome.key, 'existing-key-value-0123456789abcdef');
    assert.equal(saved, false);
});

test('tryAttachPortalAgent accepts matching configured key', () => {
    const key = 'configured-agent-key-abcdefghijklmnopqrstuv';
    const req = {
        headers: { 'x-portal-agent-key': key },
        get(name) { return this.headers[String(name).toLowerCase()]; },
    };
    assert.equal(tryAttachPortalAgent(req, { expectedKey: key }), true);
    assert.equal(req.portalAgent, true);
    assert.equal(req.user?.username, 'portal-agent');
});

test('tryAttachPortalAgent rejects wrong key', () => {
    const req = {
        headers: { authorization: 'Bearer nope' },
        get(name) { return this.headers[String(name).toLowerCase()]; },
    };
    assert.equal(tryAttachPortalAgent(req, { expectedKey: 'configured-agent-key-abcdefghijklmnopqrstuv' }), false);
    assert.equal(req.portalAgent, undefined);
});

test('readPortalAgentKeyFromRequest supports bearer', () => {
    const req = {
        headers: { authorization: 'Bearer abc.def' },
        get(name) { return this.headers[String(name).toLowerCase()]; },
    };
    assert.equal(readPortalAgentKeyFromRequest(req), 'abc.def');
});
