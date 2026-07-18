import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';

import { registerMediaIssueRoutes } from '../../lib/media-stack/media-issue-routes.js';

const createApp = ({ issues, user }) => {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
        req.user = user;
        next();
    });

    registerMediaIssueRoutes({
        app,
        requireAuth: (_req, _res, next) => next(),
        requireMember: (_req, _res, next) => next(),
        requireAdmin: (req, res, next) => (req.user?.isAdmin ? next() : res.status(403).json({ error: 'admin' })),
        configPath: 'config.json',
        issuePath: 'media-issues.json',
        loadFile: async (path, fallback) => {
            if (path === 'media-issues.json') return structuredClone(issues);
            return fallback || {};
        },
        saveFile: async () => {},
        appendAuditLog: async () => {},
        requestAppService: {
            getRequestAppGate: () => ({ ready: false }),
            listIssues: async () => ({ results: [] }),
            getIssue: async () => ({ comments: [] }),
            commentOnIssue: async () => ({}),
        },
        log: () => {},
    });

    return app;
};

const withServer = async (app, run) => {
    const server = app.listen(0);
    const { port } = server.address();
    try {
        return await run(port);
    } finally {
        await new Promise((resolve) => server.close(resolve));
    }
};

test('members can only read comments on their own portal issues', async () => {
    const issues = [{
        id: 'portal:mine',
        source: 'portal',
        reporterId: 'user-1',
        message: 'my report details',
        comments: [{ id: 'c1', message: 'secret thread', author: 'Admin', createdAt: '2026-01-01T00:00:00.000Z' }],
    }, {
        id: 'portal:other',
        source: 'portal',
        reporterId: 'user-2',
        message: 'other report details',
        comments: [{ id: 'c2', message: 'other secret', author: 'Admin', createdAt: '2026-01-01T00:00:00.000Z' }],
    }];

    const memberApp = createApp({ issues, user: { id: 'user-1', username: 'member', isAdmin: false } });
    await withServer(memberApp, async (port) => {
        const allowed = await fetch(`http://127.0.0.1:${port}/api/media-issues/${encodeURIComponent('portal:mine')}/comments`);
        assert.equal(allowed.status, 200);
        const allowedBody = await allowed.json();
        assert.equal(allowedBody.comments.length, 1);
        assert.equal(allowedBody.comments[0].message, 'secret thread');

        const denied = await fetch(`http://127.0.0.1:${port}/api/media-issues/${encodeURIComponent('portal:other')}/comments`);
        assert.equal(denied.status, 403);

        const list = await fetch(`http://127.0.0.1:${port}/api/media-issues?filter=all`);
        assert.equal(list.status, 200);
        const listBody = await list.json();
        const mine = listBody.issues.find((issue) => issue.id === 'portal:mine');
        const other = listBody.issues.find((issue) => issue.id === 'portal:other');
        assert.equal(mine.message, 'my report details');
        assert.ok(Array.isArray(mine.comments));
        assert.equal(other.message, '');
        assert.equal(other.comments, undefined);
        assert.equal(other.commentCount, 1);
    });

    const adminApp = createApp({ issues, user: { id: 'admin', username: 'admin', isAdmin: true } });
    await withServer(adminApp, async (port) => {
        const response = await fetch(`http://127.0.0.1:${port}/api/media-issues/${encodeURIComponent('portal:other')}/comments`);
        assert.equal(response.status, 200);
        const body = await response.json();
        assert.equal(body.comments[0].message, 'other secret');
    });
});
