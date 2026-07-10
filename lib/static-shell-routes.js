import fs from 'fs/promises';
import path from 'path';

import express from 'express';

import { escapeHtmlAttr, injectBasePathHtml } from './html-shell.js';
import { isBlockedHostName } from './network-policy.js';
import { setStaticAssetCacheHeaders } from './static-assets.js';

export const registerStaticShellRoutes = ({
    app,
    basePath,
    publicBaseUrl,
    port,
    configPath,
    loadFile,
    getAdminProfile,
    stripBasePathFromUrl,
    log,
}) => {
    const BASE_PATH = basePath;
    const PUBLIC_BASE_URL = publicBaseUrl;
    const PORT = port;
    const CONFIG_PATH = configPath;

    const staticDir = path.join(process.cwd(), 'static');
    app.use('/static', express.static(staticDir, {
        etag: true,
        lastModified: true,
        setHeaders: setStaticAssetCacheHeaders,
    }));
    if (BASE_PATH) {
        app.use(`${BASE_PATH}/static`, express.static(staticDir, {
            etag: true,
            lastModified: true,
            setHeaders: setStaticAssetCacheHeaders,
        }));
    }

    // Serve optional legacy stylesheet from the root directory
    app.get('/style.css', (req, res) => {
        const cssPath = path.join(process.cwd(), 'style.css');
        res.setHeader('Cache-Control', 'public, max-age=300, must-revalidate');
        res.sendFile(cssPath, (err) => {
            if (err) res.type('text/css').send('/* style.css not found */');
        });
    });

    const getRequestBaseUrl = (req) => {
        if (PUBLIC_BASE_URL) {
            try {
                return new URL(PUBLIC_BASE_URL).toString().replace(/\/+$/, '');
            } catch (e) {
                log(`Invalid PUBLIC_BASE_URL configured: ${e.message}`);
            }
        }
        const host = req.get('host') || `localhost:${PORT}`;
        const normalizedHost = host.split(',')[0].trim();
        if (isBlockedHostName(normalizedHost.split(':')[0])) {
            return `${req.secure ? 'https' : 'http'}://localhost:${PORT}`;
        }
        const proto = req.secure ? 'https' : 'http';
        return `${proto}://${normalizedHost}${BASE_PATH}`;
    };

    const buildSocialMetaTags = async (req) => {
        const config = await loadFile(CONFIG_PATH, {});
        const profile = await getAdminProfile(config);
        const baseUrl = getRequestBaseUrl(req);
        const pageUrl = `${baseUrl}${stripBasePathFromUrl(req.originalUrl || '/')}`;
        const serverName = profile.serverName || 'Server Portal';
        const serverId = config.serverIdentifier || 'unconfigured';
        const description = `Live Plex portal for ${serverName} (${serverId}).`;
        const title = `${serverName} Portal`;

        let imageUrl = '';
        const configuredImage = config.customLogoUrl || profile.thumb || '';
        if (configuredImage) {
            imageUrl = configuredImage.startsWith('http')
                ? configuredImage
                : `${baseUrl}/api/plex/image?path=${encodeURIComponent(configuredImage)}&width=1200&height=630`;
        }

        const tags = [
            `<meta property="og:type" content="website" />`,
            `<meta property="og:site_name" content="${escapeHtmlAttr(serverName)}" />`,
            `<meta property="og:title" content="${escapeHtmlAttr(title)}" />`,
            `<meta property="og:description" content="${escapeHtmlAttr(description)}" />`,
            `<meta property="og:url" content="${escapeHtmlAttr(pageUrl)}" />`,
            ...(imageUrl ? [`<meta property="og:image" content="${escapeHtmlAttr(imageUrl)}" />`] : []),
            `<meta name="twitter:card" content="${imageUrl ? 'summary_large_image' : 'summary'}" />`,
            `<meta name="twitter:title" content="${escapeHtmlAttr(title)}" />`,
            `<meta name="twitter:description" content="${escapeHtmlAttr(description)}" />`,
            ...(imageUrl ? [`<meta name="twitter:image" content="${escapeHtmlAttr(imageUrl)}" />`] : []),
            `<meta name="description" content="${escapeHtmlAttr(description)}" />`
        ].join('\n    ');

        return { title, tags };
    };

    const indexPath = path.join(process.cwd(), 'index.html');
    let cachedIndexHtml = null;
    let cachedIndexMtimeMs = 0;
    const readIndexHtml = async () => {
        const stat = await fs.stat(indexPath);
        if (cachedIndexHtml && cachedIndexMtimeMs === stat.mtimeMs) {
            return cachedIndexHtml;
        }
        cachedIndexHtml = await fs.readFile(indexPath, 'utf8');
        cachedIndexMtimeMs = stat.mtimeMs;
        return cachedIndexHtml;
    };

    // Serve the main index.html for SPA routes (after base-path strip, paths are root-relative)
    app.get(/^\/(?!api\/|static\/).*$/, async (req, res) => {
        try {
            const html = await readIndexHtml();
            const socialMeta = await buildSocialMetaTags(req);
            const updatedHtml = injectBasePathHtml(html
                .replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtmlAttr(socialMeta.title)}</title>`)
                .replace('</head>', `    ${socialMeta.tags}\n</head>`), BASE_PATH);
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.send(updatedHtml);
        } catch (e) {
            try {
                const html = await readIndexHtml();
                res.setHeader('Content-Type', 'text/html; charset=utf-8');
                res.send(injectBasePathHtml(html, BASE_PATH));
            } catch {
                res.status(500).send('Failed to load application shell.');
            }
        }
    });


};
