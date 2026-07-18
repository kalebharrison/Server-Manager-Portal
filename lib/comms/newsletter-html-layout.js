import { escapeHtmlAttr } from '../http/html-shell.js';

export const buildNewsletterHtmlDocument = ({ htmlContent, serverName }) => {
    const safeServerName = escapeHtmlAttr(serverName || 'our Plex Server');
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
    `.replace(/{{SERVER_NAME}}/g, safeServerName);

    return finalHtml;
};

export const buildNewsletterBodyContent = ({ recentHtml, uptimeStr, stats, publicDomain }) => `
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
                                                <h2 style="margin: 8px 0 0 0; color: #22c55e; font-family: Helvetica, Arial, sans-serif; font-size: 26px;">${escapeHtmlAttr(uptimeStr)}</h2>
                                            </td>
                                            <td width="4%" style="font-size: 0; line-height: 0;">&nbsp;</td>
                                            <!-- Library -->
                                            <td width="48%" align="center" style="padding: 20px; background-color: rgba(31, 41, 55, 0.6); border-radius: 12px; border: 1px solid rgba(255, 255, 255, 0.05); box-shadow: 0 4px 15px rgba(0,0,0,0.3);">
                                                <p style="margin: 0; color: #9ca3af; font-family: Helvetica, Arial, sans-serif; font-size: 12px; text-transform: uppercase; letter-spacing: 1px;">Library Size</p>
                                                <p style="margin: 8px 0 4px 0; color: #ffffff; font-family: Helvetica, Arial, sans-serif; font-size: 15px;"><strong>${escapeHtmlAttr(String(stats.movies ?? 0))}</strong> Movies</p>
                                                <p style="margin: 0; color: #ffffff; font-family: Helvetica, Arial, sans-serif; font-size: 15px;"><strong>${escapeHtmlAttr(String(stats.shows ?? 0))}</strong> TV Shows</p>
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
                                    <p style="margin: 0; color: #6b7280; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 12px;">Manage or unsubscribe anytime in your <a href="${escapeHtmlAttr(publicDomain || '#')}" style="color: #eab308; text-decoration: none;">User Portal</a> preferences.</p>
                                </td>
                            </tr>
`;
