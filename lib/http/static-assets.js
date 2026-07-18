import path from 'path';

export const setStaticAssetCacheHeaders = (res, filePath) => {
    const normalized = filePath.split(path.sep).join('/');
    if (normalized.includes('/chunks/')) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        return;
    }
    res.setHeader('Cache-Control', 'public, max-age=300, must-revalidate');
};
