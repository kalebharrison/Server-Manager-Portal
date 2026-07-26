import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const intentionallyPublic = [
    /^POST \/api\/auth\/(plex\/login|plex\/callback|jellyfin\/login|jellyfin\/quick-connect\/(initiate|poll))$/,
    /^GET \/api\/auth\/(plex\/callback|session)$/,
    /^POST \/api\/setup\/plex\/callback$/,
    /^GET \/api\/config\/public$/,
    /^POST \/api\/config$/,
    /^POST \/api\/config\/test-integration$/,
    /^POST \/api\/plex\/servers$/,
    /^GET \/api\/public\/(info|plex\/stats)$/,
    /^GET \/api\/(health|status)$/,
    /^GET \/api\/invites\/:code\/info$/,
    /^POST \/api\/invites\/:code\/claim$/,
    /^GET \/api\/jellyfin\/branding\/(splash|icon|favicon)$/,
];

const walkJsFiles = async (dir) => {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            files.push(...await walkJsFiles(fullPath));
            continue;
        }
        if (entry.isFile() && entry.name.endsWith('.js')) files.push(fullPath);
    }
    return files;
};

test('every API route is authenticated or explicitly classified as public', async () => {
    const libDir = path.resolve('lib');
    const files = await walkJsFiles(libDir);
    assert.ok(files.length > 0, 'Expected to discover JS modules under lib/');
    const unclassified = [];

    for (const filePath of files) {
        const rel = path.relative(libDir, filePath);
        const lines = (await fs.readFile(filePath, 'utf8')).split('\n');
        lines.forEach((line, index) => {
            const match = line.match(/app\.(get|post|put|patch|delete)\('([^']+)'/);
            if (!match) return;
            const method = match[1].toUpperCase();
            const route = match[2];
            if (!route.startsWith('/api/')) return;
            if (intentionallyPublic.some((pattern) => pattern.test(`${method} ${route}`))) return;
            // requireMemberOrPortalAgent = session member auth OR PORTAL_AGENT_API_KEY
            if (/\brequire(?:Auth|Member|Admin|MemberOrPortalAgent)\b/.test(line)) return;
            unclassified.push(`${rel}:${index + 1} ${method} ${route}`);
        });
    }

    assert.deepEqual(unclassified, [], `Unclassified API routes:\n${unclassified.join('\n')}`);
});
