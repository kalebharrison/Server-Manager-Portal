import assert from 'node:assert/strict';
import test from 'node:test';

import {
    getPortalAgentApiKey,
    readPortalAgentKeyFromRequest,
    tryAttachPortalAgent,
} from '../../lib/auth/portal-agent-key.js';

test('tryAttachPortalAgent accepts matching X-Portal-Agent-Key', () => {
    const req = {
        headers: { 'x-portal-agent-key': 'test-agent-key-123456' },
        get(name) { return this.headers[String(name).toLowerCase()]; },
    };
    assert.equal(tryAttachPortalAgent(req, { PORTAL_AGENT_API_KEY: 'test-agent-key-123456' }), true);
    assert.equal(req.portalAgent, true);
    assert.equal(req.user?.username, 'portal-agent');
});

test('tryAttachPortalAgent rejects wrong key', () => {
    const req = {
        headers: { authorization: 'Bearer nope' },
        get(name) { return this.headers[String(name).toLowerCase()]; },
    };
    assert.equal(tryAttachPortalAgent(req, { PORTAL_AGENT_API_KEY: 'test-agent-key-123456' }), false);
    assert.equal(req.portalAgent, undefined);
});

test('readPortalAgentKeyFromRequest supports bearer', () => {
    const req = {
        headers: { authorization: 'Bearer abc.def' },
        get(name) { return this.headers[String(name).toLowerCase()]; },
    };
    assert.equal(readPortalAgentKeyFromRequest(req), 'abc.def');
    assert.equal(getPortalAgentApiKey({ PORTAL_AGENT_API_KEY: ' x ' }), 'x');
});
