import { calculateUptime30Days } from '../status/status-monitor.js';
import { resolveEmailServerName } from './email-identity.js';
import { buildInlineLogoAttachment, shouldAttachInlineLogo } from './email-send.js';
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
        const { recentHtml, serverName, attachments } = await fetchRecentContent(config);
        const resolvedName = resolveEmailServerName(config, serverName);

        const uptimeStr = `${calculateUptime30Days(getHealthData()).toFixed(2)}%`;
        const htmlContent = buildNewsletterBodyContent({
            recentHtml,
            uptimeStr,
            stats,
            publicDomain: config.publicDomain,
            config,
        });
        const finalHtml = buildNewsletterHtmlDocument({ htmlContent, serverName: resolvedName, config });
        const logo = shouldAttachInlineLogo(finalHtml) ? await buildInlineLogoAttachment(config) : null;

        return { html: finalHtml, attachments: logo ? [logo, ...attachments] : attachments };
    };

    return { generateNewsletterHtml };
};
