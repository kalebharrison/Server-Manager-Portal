import fs from 'fs/promises';
import path from 'path';
import { calculateUptime30Days } from '../status/status-monitor.js';

export const createNewsletterHtmlBuilder = ({
    getPlexConnectionUri,
    getPlexStats,
    getHealthData,
}) => {
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

    const generateNewsletterHtml = async (config) => {
        const stats = await getPlexStats() || { movies: 0, shows: 0, music: 0 };
        let recentHtml = '';
        let serverName = 'our Plex Server';
        const attachments = [];
        let cidCounter = 1;

        try {
            const logoPath = path.join(process.cwd(), 'static', 'logo.png');
            const logoBuf = await fs.readFile(logoPath).catch(() => null);
            if (logoBuf) {
                attachments.push({ filename: 'logo.png', content: logoBuf, cid: 'logo' });
            }
        } catch (e) { }

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

            const tvShows = Array.from(tvShowsMap.values());

            const renderGrid = async (categoryItems, categoryTitle, isSquare = false) => {
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
                            const cid = `poster-${cidCounter++}`;
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
                                <h4 style="margin: 0; color: #ffffff; font-size: 12px; font-family: Helvetica, Arial, sans-serif; line-height: 1.3; text-align: center; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;">${item.title || item.parentTitle || item.grandparentTitle || 'Unknown'}</h4>
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

            const moviesHtml = await renderGrid(movies, 'Recently Added Movies', false);
            const tvHtml = await renderGrid(tvShows, 'Recently Added TV', false);
            const musicHtml = await renderGrid(music, 'Recently Added Music', true);

            recentHtml = moviesHtml + tvHtml + musicHtml;

        } catch (e) {
            recentHtml = '<p style="color:#a0aec0; text-align:center;">Failed to load recently added content.</p>';
        }

        const uptimeStr = `${calculateUptime30Days(getHealthData()).toFixed(2)}%`;

        const htmlContent = `
                            <!-- Header -->
                            <tr>
                                <td align="center" style="padding: 40px 30px; background-color: #0b0f19; border-bottom: 1px solid #1f2937;">
                                    <img src="cid:logo" alt="Plex Portal" style="max-width: 280px; height: auto; display: block; margin: 0 auto 10px auto;" />
                                    <p style="color: #9ca3af; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 16px; margin: 0;">Here is what's happening on the server</p>
                                </td>
                            </tr>
                            
                            <!-- Stats Row -->
                            <tr>
                                <td style="padding: 30px;">
                                    <table width="100%" cellpadding="0" cellspacing="0" border="0">
                                        <tr>
                                            <!-- Uptime -->
                                            <td width="48%" align="center" style="padding: 20px; background-color: rgba(31, 41, 55, 0.6); border-radius: 12px; border: 1px solid rgba(255, 255, 255, 0.05); box-shadow: 0 4px 15px rgba(0,0,0,0.3);">
                                                <p style="margin: 0; color: #9ca3af; font-family: Helvetica, Arial, sans-serif; font-size: 12px; text-transform: uppercase; letter-spacing: 1px;">30-Day Uptime</p>
                                                <h2 style="margin: 8px 0 0 0; color: #22c55e; font-family: Helvetica, Arial, sans-serif; font-size: 26px;">${uptimeStr}</h2>
                                            </td>
                                            <td width="4%" style="font-size: 0; line-height: 0;">&nbsp;</td>
                                            <!-- Library -->
                                            <td width="48%" align="center" style="padding: 20px; background-color: rgba(31, 41, 55, 0.6); border-radius: 12px; border: 1px solid rgba(255, 255, 255, 0.05); box-shadow: 0 4px 15px rgba(0,0,0,0.3);">
                                                <p style="margin: 0; color: #9ca3af; font-family: Helvetica, Arial, sans-serif; font-size: 12px; text-transform: uppercase; letter-spacing: 1px;">Library Size</p>
                                                <p style="margin: 8px 0 4px 0; color: #ffffff; font-family: Helvetica, Arial, sans-serif; font-size: 15px;"><strong>${stats.movies}</strong> Movies</p>
                                                <p style="margin: 0; color: #ffffff; font-family: Helvetica, Arial, sans-serif; font-size: 15px;"><strong>${stats.shows}</strong> TV Shows</p>
                                            </td>
                                        </tr>
                                    </table>
                                </td>
                            </tr>

                            <!-- Greeting -->
                            <tr>
                                <td style="padding: 0 30px 20px 30px; text-align: center;">
                                    <p style="margin: 0; color: #9ca3af; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.5;">
                                        <strong>{{USERNAME}}</strong>, you opted in to receive this newsletter as a member of <strong>{{SERVER_NAME}}</strong>.
                                    </p>
                                </td>
                            </tr>

                            <!-- Recently Added -->
                            <tr>
                                <td style="padding: 0 30px 30px 30px;">
                                    ${recentHtml}
                                </td>
                            </tr>

                            <!-- Footer -->
                            <tr>
                                <td align="center" style="padding: 30px; background-color: #0b0f19; border-top: 1px solid #1f2937;">
                                    <p style="margin: 0 0 10px 0; color: #6b7280; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 12px;">This is an automated message from Plex Server Manager.</p>
                                    <p style="margin: 0; color: #6b7280; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 12px;">Manage or unsubscribe anytime in your <a href="${config.publicDomain}" style="color: #eab308; text-decoration: none;">User Portal</a> preferences.</p>
                                </td>
                            </tr>
                        `;

        const finalHtml = `
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="utf-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Plex Server Automated Newsletter</title>
                </head>
                <body style="margin: 0; padding: 0; background-color: #000000; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;">
                    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #000000;">
                        <tr>
                            <td align="center" style="padding: 20px 0;">
                                <table width="600" cellpadding="0" cellspacing="0" border="0" style="background-color: #0b0f19; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.5);">
                                    ${htmlContent}
                                </table>
                            </td>
                        </tr>
                    </table>
                </body>
                </html>
        `.replace(/{{SERVER_NAME}}/g, serverName);

        return { html: finalHtml, attachments };
    };

    return { generateNewsletterHtml };
};
