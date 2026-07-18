import fs from 'fs/promises';
import path from 'path';
import { calculateUptime30Days } from '../status/status-monitor.js';
import { createNewsletterRecentContent } from './newsletter-html-recent.js';
import { buildNewsletterBodyContent, buildNewsletterHtmlDocument } from './newsletter-html-layout.js';

export const createNewsletterHtmlBuilder = ({
    getPlexConnectionUri,
    getPlexStats,
    getHealthData,
}) => {
    const { fetchRecentContent } = createNewsletterRecentContent({ getPlexConnectionUri });

    const generateNewsletterHtml = async (config) => {
        const stats = await getPlexStats() || { movies: 0, shows: 0, music: 0 };
        const attachments = [];

        try {
            const logoPath = path.join(process.cwd(), 'static', 'logo.png');
            const logoBuf = await fs.readFile(logoPath).catch(() => null);
            if (logoBuf) {
                attachments.push({ filename: 'logo.png', content: logoBuf, cid: 'logo' });
            }
        } catch (e) { }

        const { recentHtml, serverName, attachments: recentAttachments } = await fetchRecentContent(config);
        attachments.push(...recentAttachments);

        const uptimeStr = `${calculateUptime30Days(getHealthData()).toFixed(2)}%`;
        const htmlContent = buildNewsletterBodyContent({
            recentHtml,
            uptimeStr,
            stats,
            publicDomain: config.publicDomain,
        });
        const finalHtml = buildNewsletterHtmlDocument({ htmlContent, serverName });

        return { html: finalHtml, attachments };
    };

    return { generateNewsletterHtml };
};
