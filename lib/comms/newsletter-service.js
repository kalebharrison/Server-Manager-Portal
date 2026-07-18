import { createNewsletterHtmlBuilder } from './newsletter-html.js';
import { createNewsletterSendHelpers } from './newsletter-send.js';

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
    const { generateNewsletterHtml } = createNewsletterHtmlBuilder({
        getPlexConnectionUri,
        getPlexStats,
        getHealthData,
    });

    const {
        checkAndSendNewsletter,
        sendTestNewsletter,
        sendManualNewsletter,
    } = createNewsletterSendHelpers({
        configPath,
        usersPath,
        loadFile,
        saveFile,
        generateNewsletterHtml,
        escapeHtmlAttr,
        log,
    });

    return {
        generateNewsletterHtml,
        checkAndSendNewsletter,
        sendTestNewsletter,
        sendManualNewsletter,
    };
};
