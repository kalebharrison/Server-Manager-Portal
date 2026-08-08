import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

import { extractEmailAddress } from './email-recipients.js';

export const INBOUND_SECRET_FIELD = 'mailjetInboundSecret';
const SIG_LEN = 16;

const safeEqualHex = (left, right) => {
    const a = Buffer.from(String(left || ''), 'utf8');
    const b = Buffer.from(String(right || ''), 'utf8');
    if (a.length !== b.length) {
        timingSafeEqual(a, a);
        return false;
    }
    return timingSafeEqual(a, b);
};

export const resolveInboundReplyDomain = (config = {}) => {
    const explicit = String(config.inboundReplyDomain || '').trim().toLowerCase().replace(/^@/, '');
    if (explicit) return explicit;
    const from = extractEmailAddress(config.smtpFrom || '');
    const host = from.split('@')[1] || '';
    if (!host) return '';
    return host.startsWith('reply.') ? host : `reply.${host}`;
};

export const resolveInboundReplyMailbox = (config = {}) => {
    const mailbox = String(config.inboundReplyMailbox || 'replies').trim().toLowerCase();
    return mailbox.replace(/[^a-z0-9._-]/g, '') || 'replies';
};

export const ensureInboundReplySecret = (config = {}) => {
    const existing = String(config[INBOUND_SECRET_FIELD] || '').trim();
    if (existing) return { config, secret: existing, created: false };
    const secret = randomBytes(32).toString('hex');
    return {
        config: { ...config, [INBOUND_SECRET_FIELD]: secret },
        secret,
        created: true,
    };
};

export const encodeInboundToken = (kind, id) => {
    const raw = String(id || '').trim();
    if (!raw) return '';
    if (kind === 'test') return `t.${raw.replace(/[^a-zA-Z0-9_-]/g, '')}`;
    if (kind === 'request') return `r.${raw.replace(/[^a-zA-Z0-9_-]/g, '')}`;
    if (raw.startsWith('portal:')) return `i.p${raw.slice(7).replace(/-/g, '')}`;
    return `i.x${raw.replace(/[^a-zA-Z0-9]/g, '').slice(0, 40)}`;
};

export const decodeInboundToken = (token = '') => {
    const value = String(token || '').trim();
    const test = value.match(/^t\.([a-zA-Z0-9_-]+)$/);
    if (test) return { kind: 'test', id: test[1] };
    const request = value.match(/^r\.([a-zA-Z0-9_-]+)$/);
    if (request) return { kind: 'request', id: request[1] };
    const portal = value.match(/^i\.p([a-fA-F0-9]{32})$/);
    if (portal) {
        const hex = portal[1].toLowerCase();
        const uuid = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
        return { kind: 'issue', id: `portal:${uuid}` };
    }
    const other = value.match(/^i\.x([a-zA-Z0-9]+)$/);
    if (other) return { kind: 'issue', id: other[1] };
    return null;
};

const signToken = (secret, token) => createHmac('sha256', String(secret || ''))
    .update(String(token || ''))
    .digest('hex')
    .slice(0, SIG_LEN);

export const buildInboundReplyTo = (config = {}, { kind, id } = {}) => {
    const domain = resolveInboundReplyDomain(config);
    const secret = String(config[INBOUND_SECRET_FIELD] || '').trim();
    const token = encodeInboundToken(kind, id);
    if (!domain || !secret || !token || /\.$/.test(token)) return '';
    return `${token}.${signToken(secret, token)}@${domain}`;
};

export const listInboundRecipientCandidates = (payload = {}) => {
    const headers = payload.Headers && typeof payload.Headers === 'object' ? payload.Headers : {};
    const values = [
        payload.Recipient,
        payload.To,
        headers.To,
        headers['Delivered-To'],
        headers['X-Original-To'],
    ].flatMap((value) => (Array.isArray(value) ? value : [value]));
    return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))];
};

const localPartFromRecipient = (recipient) => {
    const address = extractEmailAddress(recipient);
    if (!address) return '';
    const at = address.lastIndexOf('@');
    if (at < 0) return '';
    const local = address.slice(0, at);
    const plus = local.indexOf('+');
    return plus >= 0 ? local.slice(plus + 1) : local;
};

export const parseInboundRecipient = (recipient, secret) => {
    const local = localPartFromRecipient(recipient);
    const match = String(local || '').match(/^(.*)\.([a-f0-9]{16})$/i);
    if (!match || !secret) return null;
    const token = match[1];
    const sig = match[2].toLowerCase();
    if (!safeEqualHex(sig, signToken(secret, token))) return null;
    return decodeInboundToken(token);
};

export const extractInboundReplyBody = (text = '') => {
    const lines = String(text || '').replace(/\r\n/g, '\n').split('\n');
    const cut = lines.findIndex((line) => {
        const trimmed = line.trim();
        if (!trimmed) return false;
        if (/^--\s*$/.test(trimmed)) return true;
        if (/^On .+wrote:$/i.test(trimmed)) return true;
        if (/^-{2,}\s*Original Message\s*-{2,}$/i.test(trimmed)) return true;
        if (/^From:\s.+/i.test(trimmed) && /@/.test(trimmed)) return true;
        if (/^_{5,}$/.test(trimmed)) return true;
        return false;
    });
    return (cut >= 0 ? lines.slice(0, cut) : lines).join('\n').trim().slice(0, 4000);
};

export const inboundMessageId = (payload = {}) => {
    const headers = payload.Headers && typeof payload.Headers === 'object' ? payload.Headers : {};
    const raw = headers['Message-ID'] || headers['Message-Id'] || payload['Message-ID'] || '';
    const value = Array.isArray(raw) ? raw[0] : raw;
    return String(value || '').trim().slice(0, 300);
};
