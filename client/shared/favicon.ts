import { logoUrl, portalUrl, resolvePortalAssetUrl } from './basePath';

export const updateFavicon = (thumbUrl: string | null | undefined) => {
    let link = document.querySelector("link[rel~='icon']") as HTMLLinkElement;
    if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        link.type = 'image/png';
        document.head.appendChild(link);
    }
    if (thumbUrl) {
        if (thumbUrl.startsWith('http://') || thumbUrl.startsWith('https://')) {
            link.href = thumbUrl;
        } else if (thumbUrl.startsWith('/api/')) {
            link.href = resolvePortalAssetUrl(thumbUrl);
        } else {
            link.href = portalUrl(`/api/plex/image?path=${encodeURIComponent(thumbUrl)}&width=32&height=32`);
        }
    } else {
        link.href = logoUrl();
    }
};
