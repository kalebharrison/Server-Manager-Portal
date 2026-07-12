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

test('every API route is authenticated or explicitly classified as public', async () => {
    const libDir = path.resolve('lib');
    const files = (await fs.readdir(libDir)).filter((file) => file.endsWith('.js'));
    const unclassified = [];

    for (const file of files) {
        const lines = (await fs.readFile(path.join(libDir, file), 'utf8')).split('\n');
        lines.forEach((line, index) => {
            const match = line.match(/app\.(get|post|put|patch|delete)\('([^']+)'/);
            if (!match) return;
            const method = match[1].toUpperCase();
            const route = match[2];
            if (!route.startsWith('/api/')) return;
            if (intentionallyPublic.some((pattern) => pattern.test(`${method} ${route}`))) return;
            if (/\brequire(?:Auth|Member|Admin)\b/.test(line)) return;
            unclassified.push(`${file}:${index + 1} ${route}`);
        });
    }

    assert.deepEqual(unclassified, [], `Unclassified API routes:\n${unclassified.join('\n')}`);
});
