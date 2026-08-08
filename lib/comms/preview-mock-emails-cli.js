#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

import { writeMockEmailPreviews } from './email-mock-catalog.js';

const args = process.argv.slice(2);
const outDir = args.find((arg) => !arg.startsWith('--')) || path.join(process.cwd(), '.local', 'email-previews');
const publicDomain = args.find((arg) => arg.startsWith('--public-domain='))?.slice('--public-domain='.length)
    || process.env.PORTAL_PUBLIC_DOMAIN
    || 'https://example.com';
const customLogoUrl = args.find((arg) => arg.startsWith('--logo-url='))?.slice('--logo-url='.length)
    || process.env.PORTAL_LOGO_URL
    || '/static/branding/logo.png';
const logoFile = args.find((arg) => arg.startsWith('--logo-file='))?.slice('--logo-file='.length) || '';

fs.mkdirSync(outDir, { recursive: true });
let logoHref = customLogoUrl;
if (logoFile && fs.existsSync(logoFile)) {
    const destLogo = path.join(outDir, 'logo.png');
    fs.copyFileSync(logoFile, destLogo);
    logoHref = 'logo.png';
}

const result = await writeMockEmailPreviews({
    outDir,
    logoHref,
    config: {
        smtpFrom: process.env.PORTAL_SMTP_FROM || 'Requests - LostWaldo <requests@lostwaldo.net>',
        publicDomain,
        customLogoUrl,
        contactEmail: 'owner@example.com',
        serverIdentifier: 'mock-server',
    },
});
console.log(JSON.stringify(result, null, 2));
