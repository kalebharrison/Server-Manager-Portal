import fs from 'fs/promises';
import path from 'path';
import nodemailer from 'nodemailer';
import { calculateUptime30Days } from './status-monitor.js';
import { resolveDisplayName, wantsNewsletter } from './user-profile.js';

export const createNewsletterService = ({
    configPath,
    usersPath,
    loadFile,
    saveFile,
    getPlexConnectionUri,
    getPlexStats,
    getHealthData,
    escapeHtmlAttr,
    log,
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

            // serverName is declared at function scope above
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


    const checkAndSendNewsletter = async (config, force = false) => {
        if (!config.newsletterFrequency || config.newsletterFrequency === 'disabled') return;
        if (!config.smtpHost || !config.smtpUser) return;

        const now = new Date();
        const dateStr = now.toISOString().split('T')[0];

        if (!force) {
            const dayOfWeek = now.getDay();
            const dayOfMonth = now.getDate();

            let shouldSend = false;
            if (config.newsletterFrequency === 'weekly' && dayOfWeek === Number(config.newsletterDay)) {
                shouldSend = true;
            } else if (config.newsletterFrequency === 'monthly' && dayOfMonth === Number(config.newsletterDay)) {
                shouldSend = true;
            }

            if (!shouldSend) return;
            if (config.lastNewsletterSent === dateStr) return;
        }

        try {
            log('Generating and sending automated newsletters...');
            const { html, attachments } = await generateNewsletterHtml(config);
            const transporter = nodemailer.createTransport({
                host: config.smtpHost,
                port: config.smtpPort,
                secure: config.smtpSecure,
                auth: { user: config.smtpUser, pass: config.smtpPass }
            });

            const users = await loadFile(usersPath, []);
            // Opt-in only: legacy optOutNewsletter is ignored and never treated as consent.
            const recipients = users.filter(user => user.email && wantsNewsletter(user));

            if (recipients.length === 0) return;

            // Mark as sent immediately to prevent re-sending if the server restarts during the 30-minute window
            config.lastNewsletterSent = dateStr;
            await saveFile(configPath, config);

            // Spread the sending out over a 30-minute period (1,800,000 ms) to avoid Gmail rate limits
            const totalDurationMs = 30 * 60 * 1000;
            const delayPerEmailMs = Math.floor(totalDurationMs / recipients.length);

            let sentCount = 0;
            for (const user of recipients) {
                const personalizedHtml = html.replace(/{{USERNAME}}/g, escapeHtmlAttr(resolveDisplayName(user)));

                try {
                    await transporter.sendMail({
                        from: config.smtpFrom || config.smtpUser,
                        to: user.email,
                        subject: 'Plex Server Automated Newsletter',
                        html: personalizedHtml,
                        attachments: attachments
                    });
                    sentCount++;
                    await new Promise(resolve => setTimeout(resolve, delayPerEmailMs));
                } catch (e) {
                    log(`Failed to send newsletter to ${user.email}: ${e.message}`);
                }
            }

            log(`Newsletter sent to ${sentCount} users.`);
        } catch (e) {
            log(`Failed to generate/send newsletter: ${e.message}`);
        }
    };

    const sendTestNewsletter = async (config) => {
        if (!config.smtpHost || !config.smtpUser) {
            const error = new Error('SMTP not configured');
            error.statusCode = 400;
            throw error;
        }

        let adminEmail = null;
        try {
            const userRes = await fetch('https://plex.tv/api/v2/user', {
                headers: { 'X-Plex-Token': config.plexToken, 'Accept': 'application/json' }
            });
            if (userRes.ok) {
                const userData = await userRes.json();
                adminEmail = userData.email;
            }
        } catch (e) {
            log('Error fetching admin email: ' + e.message);
        }

        if (!adminEmail) {
            const error = new Error('Could not fetch admin email from Plex account.');
            error.statusCode = 400;
            throw error;
        }

        const { html, attachments } = await generateNewsletterHtml(config);
        const transporter = nodemailer.createTransport({
            host: config.smtpHost,
            port: config.smtpPort,
            secure: config.smtpSecure,
            auth: { user: config.smtpUser, pass: config.smtpPass }
        });

        await transporter.sendMail({
            from: config.smtpFrom || config.smtpUser,
            to: adminEmail,
            subject: 'Plex Server Automated Newsletter (Test)',
            html: html.replace(/{{USERNAME}}/g, 'Admin'),
            attachments
        });
    };

    const sendManualNewsletter = async (config) => {
        if (!config.smtpHost || !config.smtpUser) {
            const error = new Error('SMTP not configured');
            error.statusCode = 400;
            throw error;
        }

        const users = await loadFile(usersPath, []);
        const validUsers = users.filter(u => u.email);
        if (validUsers.length === 0) {
            const error = new Error('No users with email addresses found.');
            error.statusCode = 400;
            throw error;
        }

        const { html, attachments } = await generateNewsletterHtml(config);
        const transporter = nodemailer.createTransport({
            host: config.smtpHost,
            port: config.smtpPort,
            secure: config.smtpSecure,
            auth: { user: config.smtpUser, pass: config.smtpPass }
        });

        log(`Manual newsletter trigger initiated for ${validUsers.length} users.`);
        for (const user of validUsers) {
            try {
                await transporter.sendMail({
                    from: config.smtpFrom || config.smtpUser,
                    to: user.email,
                    subject: 'Plex Server Automated Newsletter',
                    html,
                    attachments
                });
                await new Promise(resolve => setTimeout(resolve, 15000));
            } catch (e) {
                log(`Failed to send manual newsletter to ${user.email}: ${e.message}`);
            }
        }
        log(`Manual newsletter dispatch completed.`);
        config.lastNewsletterSent = new Date().toISOString().split('T')[0];
        await saveFile(configPath, config);

        return { count: validUsers.length };
    };

    return {
        generateNewsletterHtml,
        checkAndSendNewsletter,
        sendTestNewsletter,
        sendManualNewsletter,
    };
};
