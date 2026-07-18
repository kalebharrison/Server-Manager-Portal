const ALLOWED_TAGS = new Set([
    'a', 'b', 'blockquote', 'br', 'div', 'em', 'h1', 'h2', 'h3', 'h4', 'hr',
    'i', 'li', 'ol', 'p', 'span', 'strong', 'table', 'tbody', 'td', 'th', 'thead', 'tr', 'u', 'ul',
]);

const ALLOWED_ATTRS = {
    a: new Set(['href', 'title', 'target', 'rel']),
    '*': new Set(['style']),
};

const SAFE_HREF = /^(https?:|mailto:|#)/i;

const decodeEntities = (value) => String(value || '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');

const escapeText = (value) => String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const sanitizeStyle = (value) => {
    const cleaned = String(value || '')
        .replace(/expression\s*\(/gi, '')
        .replace(/url\s*\(\s*['"]?\s*javascript\s*:/gi, '')
        .replace(/-moz-binding/gi, '')
        .replace(/behavior\s*:/gi, '');
    return cleaned.slice(0, 500);
};

const sanitizeAttrs = (tag, rawAttrs) => {
    const allowed = new Set([...(ALLOWED_ATTRS[tag] || []), ...(ALLOWED_ATTRS['*'] || [])]);
    const attrs = [];
    const attrRe = /([^\s=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
    let match;
    while ((match = attrRe.exec(rawAttrs || '')) !== null) {
        const name = String(match[1] || '').toLowerCase();
        if (!allowed.has(name) || name.startsWith('on')) continue;
        let value = decodeEntities(match[2] ?? match[3] ?? match[4] ?? '');
        if (name === 'href' || name === 'src') {
            value = value.trim();
            if (!SAFE_HREF.test(value)) continue;
        }
        if (name === 'target' && value !== '_blank') continue;
        if (name === 'rel') value = 'noopener noreferrer';
        if (name === 'style') value = sanitizeStyle(value);
        attrs.push(`${name}="${escapeText(value)}"`);
    }
    if (tag === 'a' && attrs.some((attr) => attr.startsWith('target=')) && !attrs.some((attr) => attr.startsWith('rel='))) {
        attrs.push('rel="noopener noreferrer"');
    }
    return attrs.length ? ` ${attrs.join(' ')}` : '';
};

/**
 * Allowlist HTML sanitizer for admin broadcast emails.
 * Strips scripts/handlers and keeps a small set of formatting tags.
 */
export const sanitizeBroadcastHtml = (html) => {
    if (!html || typeof html !== 'string') return '';
    let input = html
        .replace(/<\s*(script|iframe|object|embed|form|link|meta|base|style)[\s\S]*?>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
        .replace(/<\s*(script|iframe|object|embed|form|link|meta|base|style)[^>]*>/gi, '');

    // Normalize void tags first.
    input = input.replace(/<\s*br\s*\/?\s*>/gi, '<br>').replace(/<\s*hr\s*\/?\s*>/gi, '<hr>');

    let output = '';
    let cursor = 0;
    const tokenRe = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g;
    let token;
    while ((token = tokenRe.exec(input)) !== null) {
        output += escapeText(input.slice(cursor, token.index));
        cursor = tokenRe.lastIndex;
        const raw = token[0];
        const tag = String(token[1] || '').toLowerCase();
        const isClose = raw.startsWith('</');
        if (!ALLOWED_TAGS.has(tag)) continue;
        if (tag === 'br' || tag === 'hr') {
            if (!isClose) output += `<${tag}>`;
            continue;
        }
        if (isClose) {
            output += `</${tag}>`;
            continue;
        }
        output += `<${tag}${sanitizeAttrs(tag, token[2])}>`;
    }
    output += escapeText(input.slice(cursor));
    return output.trim();
};
