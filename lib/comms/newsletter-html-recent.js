import { escapeHtmlAttr } from '../http/html-shell.js';

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
                        type: 'TV Show',
                        thumb: item.grandparentThumb || item.parentThumb || item.thumb
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
                imageUrl = `https://via.placeholder.com/${imgWidth}x${imgHeight}/1f2937/eab308?text=No+Image`;
            }

            const itemUrl = `https://app.plex.tv/desktop/#!/server/${config.serverIdentifier}/details?key=%2Flibrary%2Fmetadata%2F${item.ratingKey}`;
            cols += `
                <td width="25%" align="center" valign="top" style="padding: 10px 5px;">
                    <a href="${itemUrl}" style="text-decoration: none; display: block;" target="_blank">
                        <img src="${imageUrl}" width="${imgWidth}" height="${imgHeight}" style="width: ${imgWidth}px; height: ${imgHeight}px; object-fit: cover; border-radius: 6px; border: 1px solid #374151; display: block; margin-bottom: 8px;" alt="Poster" />
                        <h4 style="margin: 0; color: #ffffff; font-size: 12px; font-family: Helvetica, Arial, sans-serif; line-height: 1.3; text-align: center; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;">${escapeHtmlAttr(item.title || item.parentTitle || item.grandparentTitle || 'Unknown')}</h4>
                    </a>
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
                <h3 style="color: #eab308; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 16px; margin: 0 0 15px 0; padding-left: 10px; border-left: 3px solid #eab308;">${categoryTitle}</h3>
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

            const recentRes = await fetch(`${uri}/library/recentlyAdded?X-Plex-Container-Start=0&X-Plex-Container-Size=100`, {
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
            recentHtml = '<p style="color:#a0aec0; text-align:center;">Failed to load recently added content.</p>';
        }

        return { recentHtml, serverName, attachments };
    };

    return { fetchRecentContent };
};
