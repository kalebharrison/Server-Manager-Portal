import fs from 'fs/promises';
import path from 'path';

import { buildPortalPathUrl } from './email-identity.js';

const DEFAULT_LOGO_PATH = path.join(process.cwd(), 'static', 'logo.png');

const stripQuery = (value = '') => String(value || '').trim().split('?')[0];

export const localPathFromStaticUrl = (value = '') => {
    const raw = stripQuery(value);
    if (!raw.startsWith('/static/')) return '';
    return path.join(process.cwd(), raw.replace(/^\/+/, ''));
};

export const resolveLocalLogoPath = async (config = {}) => {
    const customPath = localPathFromStaticUrl(config.customLogoUrl);
    if (customPath) {
        try {
            await fs.access(customPath);
            return customPath;
        } catch {
            // fall through to bundled default
        }
    }
    try {
        await fs.access(DEFAULT_LOGO_PATH);
        return DEFAULT_LOGO_PATH;
    } catch {
        return '';
    }
};

export const resolvePreviewLogoHref = (config = {}, { fallback = 'logo.png' } = {}) => {
    const custom = stripQuery(config.customLogoUrl);
    if (/^https?:\/\//i.test(custom)) return custom;
    if (custom.startsWith('/static/')) {
        return buildPortalPathUrl(config, custom) || fallback;
    }
    return fallback;
};

export const htmlForPreview = (html = '', logoHref = 'logo.png') => String(html || '')
    .replace(/cid:logo/gi, logoHref);

export const buildInlineLogoAttachment = async (config = {}) => {
    const logoPath = await resolveLocalLogoPath(config);
    if (!logoPath) return null;
    return {
        filename: path.basename(logoPath) || 'logo.png',
        path: logoPath,
        cid: 'logo',
    };
};
