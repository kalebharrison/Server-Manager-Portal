#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

import { createConfigSecretProtector } from '../config/config-secrets.js';
import { createEmailSendHelpers } from './email-send.js';
import { sendMockEmailCatalog } from './email-mock-catalog.js';

const to = String(process.argv[2] || '').trim();
if (!to) {
    console.error('Usage: node lib/comms/send-mock-emails-cli.js recipient@example.com');
    process.exit(1);
}

const configPath = path.join(process.env.CONFIG_DIR || '/app/config', 'config.json');
const keyMaterial = process.env.CONFIG_ENCRYPTION_KEY || process.env.JWT_SECRET;
if (!keyMaterial) {
    console.error('Missing CONFIG_ENCRYPTION_KEY / JWT_SECRET');
    process.exit(1);
}

const stored = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const config = {
    ...createConfigSecretProtector(keyMaterial).unprotectConfig(stored),
    smtpEnabled: true,
};

const { sendEmail } = createEmailSendHelpers({
    usersPath: path.join(process.env.CONFIG_DIR || '/app/config', 'users.json'),
    emailLogPath: path.join(process.env.CONFIG_DIR || '/app/config', 'email-log.json'),
    loadFile: async (_filePath, fallback) => fallback,
    saveFile: async () => {},
    appendAuditLog: async () => {},
    log: (message) => console.log(message),
});

const result = await sendMockEmailCatalog({
    sendEmail,
    config,
    to,
    delayMs: 1200,
    log: (message) => console.log(message),
});
console.log(JSON.stringify({
    to: result.to,
    sent: result.sent,
    failed: result.failed,
    ids: result.results.map((row) => `${row.ok ? 'ok' : 'fail'}:${row.id}`),
}, null, 2));
if (result.failed) process.exit(1);
