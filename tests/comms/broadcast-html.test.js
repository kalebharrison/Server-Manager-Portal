import assert from 'node:assert/strict';
import test from 'node:test';

import { sanitizeBroadcastHtml } from '../../lib/comms/broadcast-html.js';

test('broadcast sanitizer strips script handlers and keeps safe formatting', () => {
    const dirty = '<p onclick="alert(1)">Hello <strong>there</strong></p><script>alert(2)</script><a href="javascript:alert(3)">x</a><a href="https://example.com" target="_blank">ok</a>';
    const clean = sanitizeBroadcastHtml(dirty);
    assert.match(clean, /<p>Hello <strong>there<\/strong><\/p>/);
    assert.doesNotMatch(clean, /script|onclick|javascript:/i);
    assert.match(clean, /href="https:\/\/example\.com"/);
    assert.match(clean, /rel="noopener noreferrer"/);
});

test('broadcast sanitizer escapes unknown tags as text-safe content', () => {
    const clean = sanitizeBroadcastHtml('<custom>hi</custom><img src=x onerror=alert(1)>');
    assert.equal(clean.includes('<custom>'), false);
    assert.equal(clean.includes('<img'), false);
    assert.match(clean, /hi/);
});
