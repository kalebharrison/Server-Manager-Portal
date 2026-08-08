import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
    htmlForPreview,
    localPathFromStaticUrl,
    resolvePreviewLogoHref,
} from '../../lib/comms/email-logo.js';
import { writeMockEmailPreviews } from '../../lib/comms/email-mock-catalog.js';

test('static branding urls map onto disk and preview hrefs', () => {
    assert.match(localPathFromStaticUrl('/static/branding/logo.png?v=1'), /static\/branding\/logo\.png$/);
    assert.equal(
        resolvePreviewLogoHref({
            publicDomain: 'https://plex-beta.lostwaldo.net',
            customLogoUrl: '/static/branding/logo.png',
        }),
        'https://plex-beta.lostwaldo.net/static/branding/logo.png',
    );
    assert.match(htmlForPreview('<img src="cid:logo">', '/static/branding/logo.png'), /\/static\/branding\/logo\.png/);
});

test('writeMockEmailPreviews writes an index and template html', async () => {
    const outDir = await fs.mkdtemp(path.join(os.tmpdir(), 'email-previews-'));
    const result = await writeMockEmailPreviews({
        outDir,
        logoHref: 'logo.png',
        config: {
            smtpFrom: 'Requests - LostWaldo <requests@lostwaldo.net>',
            publicDomain: 'https://example.com',
            customLogoUrl: '/static/branding/logo.png',
        },
    });
    const index = await fs.readFile(path.join(outDir, 'index.html'), 'utf8');
    const available = await fs.readFile(path.join(outDir, 'request_available.html'), 'utf8');
    assert.equal(result.count, 15);
    assert.match(index, /request_available\.html/);
    assert.match(available, /src="logo\.png"/);
    assert.doesNotMatch(available, /cid:logo/i);
    await fs.rm(outDir, { recursive: true, force: true });
});
