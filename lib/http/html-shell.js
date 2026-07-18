export const escapeHtmlAttr = (value = '') => String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

export const injectBasePathHtml = (html, basePath = '') => {
    const baseHref = basePath ? `${basePath}/` : '/';
    const baseTag = `<base href="${escapeHtmlAttr(baseHref)}">`;
    const baseScript = `<script>window.__BASE_PATH__=${JSON.stringify(basePath)};</script>`;
    let updated = html.includes('<base ')
        ? html
        : html.replace(/<head([^>]*)>/i, `<head$1>\n    ${baseTag}`);
    updated = updated.replace('</head>', `    ${baseScript}\n</head>`);
    if (basePath) {
        updated = updated
            .replace(/href="\/static\//g, `href="${basePath}/static/`)
            .replace(/src="\/static\//g, `src="${basePath}/static/`);
    }
    return updated;
};
