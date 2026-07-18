import crypto from 'crypto';

export const scopedCacheKey = (prefix, parts) => {
    const identity = parts.map((part) => String(part || '')).join('\u001f');
    const hash = crypto.createHash('sha256').update(identity).digest('hex').slice(0, 16);
    return `${prefix}_${hash}`;
};
