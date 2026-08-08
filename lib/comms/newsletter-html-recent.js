import { escapeHtmlAttr } from '../http/html-shell.js';
import { tmdbIdFromPlexMedia } from '../plex/plex-guid-utils.js';
import { buildPortalMediaUrl } from './email-identity.js';

export const createNewsletterRecentContent = ({ getPlexConnectionUri }) => {
    const fetchImageBuffer = async (config, thumbPath) => {
        if (!thumbPath) return null;
        try {
            const uri = await getPlexConnectionUri(config);
            const transcodeUrl = `/photo/:/transcode?width=150&height=225&minSize=1&upscale=1&url=${encodeURIComponent(thumbPath)}`;
            const url = `${uri}${transcodeUrl}&X-Plex-Token=${config.plexToken}`;
            const res = await fetch(url);
            if (res.ok) {
                return Buffer.from(await res.arrayBuffer());
            }
        } catch (e) { }
        return null;
    };

    const categorizeRecentItems = (items) => {
        const movies = [];
        const tvShowsMap = new Map();
        const music = [];

        items.forEach(item => {
            if (item.type === 'movie') {
                movies.push(item);
            } else if (item.type === 'season' || item.type === 'episode') {
                const showKey = item.grandparentRatingKey || item.parentRatingKey || item.ratingKey;
                if (!tvShowsMap.has(showKey)) {
                    tvShowsMap.set(showKey, {
                        ratingKey: showKey,
                        title: item.grandparentTitle || item.parentTitle || item.title,
                        type: 'show',
                        thumb: item.grandparentThumb || item.parentThumb || item.thumb,
                        Guid: item.grandparentGuid ? [{ id: item.grandparentGuid }] : item.Guid,
                        guid: item.grandparentGuid || item.guid,
                    });
                }
            } else if (item.type === 'album' || item.type === 'track') {
                music.push(item);
            }
        });

        return { movies, tvShows: Array.from(tvShowsMap.values()), music };
    };

    const renderGrid = async (config, categoryItems, categoryTitle, attachments, cidCounterRef, isSquare = false) => {
        if (!categoryItems || categoryItems.length === 0) return '';
        const itemsToRender = categoryItems.slice(0, 8);
        const imgWidth = 115;
        const imgHeight = isSquare ? 115 : 173;

        let cols = '';
        for (let i = 0; i < itemsToRender.length; i++) {
            if (i % 4 === 0) cols += '<tr>';

            const item = itemsToRender[i];
            let thumbPath = item.thumb;
            let imageUrl = '';

            if (thumbPath) {
                const buf = await fetchImageBuffer(config, thumbPath);
                if (buf) {
                    const cid = `poster-${cidCounterRef.value++}`;
                    attachments.push({ filename: `${cid}.jpg`, content: buf, cid: cid });
                    imageUrl = `cid:${cid}`;
                }
            }
            if (!imageUrl) {
                imageUrl = `https://via.placeholder.com/${imgWidth}x${imgHeight}/edf2f7/718096?text=No+Image`;
            }

            const itemUrl = `https://app.plex.tv/desktop/#!/server/${config.serverIdentifier}/details?key=%2Flibrary%2Fmetadata%2F${item.ratingKey}`;
            const mediaType = item.type === 'movie'
                ? 'movie'
                : (item.type === 'show' || item.type === 'season' || item.type === 'episode' ? 'tv' : '');
            const portalUrl = mediaType
                ? buildPortalMediaUrl(config, { mediaType, tmdbId: tmdbIdFromPlexMedia(item) })
                : '';
            const linkBits = [
                portalUrl ? `<a href="${escapeHtmlAttr(portalUrl)}" style="color:#e5a00d;font-size:11px;font-weight:600;text-decoration:underline;">Portal</a>` : '',
                itemUrl ? `<a href="${escapeHtmlAttr(itemUrl)}" style="color:#e5a00d;font-size:11px;font-weight:600;text-decoration:underline;">Plex</a>` : '',
            ].filter(Boolean).join(' · ');
            cols += `
                <td width="25%" align="center" valign="top" style="padding: 10px 5px;">
                    <a href="${itemUrl}" style="text-decoration: none; display: block;" target="_blank">
                        <img src="${imageUrl}" width="${imgWidth}" height="${imgHeight}" style="width: ${imgWidth}px; height: ${imgHeight}px; object-fit: cover; border-radius: 6px; border: 1px solid #e2e8f0; display: block; margin-bottom: 8px;" alt="Poster" />
                        <h4 style="margin: 0; color: #282A2D; font-size: 12px; font-family: Arial, Helvetica, sans-serif; line-height: 1.3; text-align: center; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;">${escapeHtmlAttr(item.title || item.parentTitle || item.grandparentTitle || 'Unknown')}</h4>
                    </a>
                    ${linkBits ? `<p style="margin:6px 0 0;text-align:center;">${linkBits}</p>` : ''}
                </td>
            `;

            if (i % 4 === 3 || i === itemsToRender.length - 1) {
                if (i === itemsToRender.length - 1) {
                    const remaining = 3 - (i % 4);
                    for (let j = 0; j < remaining; j++) {
                        cols += '<td width="25%"></td>';
                    }
                }
                cols += '</tr>';
            }
        }

        return `
            <div style="margin-bottom: 30px;">
                <h3 style="color: #e5a00d; font-family: Arial, Helvetica, sans-serif; font-size: 16px; margin: 0 0 15px 0; padding-left: 10px; border-left: 3px solid #e5a00d;">${categoryTitle}</h3>
                <table width="100%" cellpadding="0" cellspacing="0" border="0" style="table-layout: fixed;">
                    ${cols}
                </table>
            </div>
        `;
    };

    const fetchRecentContent = async (config) => {
        let recentHtml = '';
        let serverName = 'our Plex Server';
        const attachments = [];
        const cidCounterRef = { value: 1 };

        try {
            const uri = await getPlexConnectionUri(config);

            try {
                const serverRes = await fetch(`${uri}/?X-Plex-Token=${config.plexToken}`, {
                    headers: { 'Accept': 'application/json' }
                });
                const serverData = await serverRes.json();
                if (serverData?.MediaContainer?.friendlyName) {
                    serverName = serverData.MediaContainer.friendlyName;
                }
            } catch (e) { }

            const recentRes = await fetch(`${uri}/library/recentlyAdded?X-Plex-Container-Start=0&X-Plex-Container-Size=100&includeGuids=1`, {
                headers: { 'X-Plex-Token': config.plexToken, 'Accept': 'application/json' }
            });
            const recentData = await recentRes.json();
            const items = recentData.MediaContainer.Metadata || [];
            const { movies, tvShows, music } = categorizeRecentItems(items);

            const moviesHtml = await renderGrid(config, movies, 'Recently Added Movies', attachments, cidCounterRef, false);
            const tvHtml = await renderGrid(config, tvShows, 'Recently Added TV', attachments, cidCounterRef, false);
            const musicHtml = await renderGrid(config, music, 'Recently Added Music', attachments, cidCounterRef, true);

            recentHtml = moviesHtml + tvHtml + musicHtml;
        } catch (e) {
            recentHtml = '<p style="margin:0;color:#718096;">Failed to load recently added content.</p>';
        }

        return { recentHtml, serverName, attachments };
    };

    return { fetchRecentContent };
};
