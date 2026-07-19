import {
    getDeliveryEmail,
    resolveDisplayName,
    wantsNotifyIssueReplies,
    wantsNotifyRequestUpdates,
    wantsNotifyWatchlistAvailable,
} from './user-profile.js';

const simpleNoticeHtml = ({ title, greeting, body, footer = 'Manage email preferences anytime in your User Portal.' }) => `
<div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f6f9; padding: 30px; color: #333333; line-height: 1.6;">
  <div style="max-width: 600px; margin: auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.05); border-top: 6px solid #e5a00d;">
    <div style="background-color: #282A2D; padding: 25px; text-align: center;">
      <h1 style="color: #ffffff; margin: 0; font-size: 22px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase;">Server Portal</h1>
    </div>
    <div style="padding: 30px 40px;">
      <h2 style="color: #282A2D; font-size: 20px; margin-top: 0; font-weight: 600;">${title}</h2>
      <p>Hello <strong>${greeting}</strong>,</p>
      ${body}
    </div>
    <div style="background-color: #f7fafc; padding: 20px 30px; border-top: 1px solid #edf2f7; text-align: center; font-size: 12px; color: #a0aec0;">
      <p style="margin: 0;">${footer}</p>
    </div>
  </div>
</div>
`;

const matchPortalUser = (users, candidate = {}) => {
    const email = String(candidate.email || '').trim().toLowerCase();
    const username = String(candidate.username || candidate.displayName || '').trim().toLowerCase();
    const id = candidate.id != null ? String(candidate.id) : '';
    return users.find((user) => {
        if (id && (String(user.id) === id || String(user.plexId || '') === id)) return true;
        const userEmail = String(user.email || '').trim().toLowerCase();
        const contact = String(user.contactEmail || '').trim().toLowerCase();
        if (email && (userEmail === email || contact === email)) return true;
        const userName = String(user.username || '').trim().toLowerCase();
        return !!(username && userName && userName === username);
    }) || null;
};

export const createMemberNotifications = ({
    usersPath,
    loadFile,
    sendMemberNotice,
    escapeHtmlAttr,
    discordNotifier = null,
    log,
}) => {
    const notifyRequestUpdate = async (config, { requestedBy, title, statusLabel, requestId }) => {
        try {
            void discordNotifier?.notifyRequestUpdate(config, { requestedBy, title, statusLabel, requestId });
            const users = await loadFile(usersPath, []);
            const user = matchPortalUser(users, requestedBy || {});
            if (!user || !wantsNotifyRequestUpdates(user) || !getDeliveryEmail(user)) return false;
            const safeTitle = escapeHtmlAttr(title || 'your request');
            const safeStatus = escapeHtmlAttr(statusLabel || 'updated');
            return sendMemberNotice(config, user, {
                type: 'request_update',
                uniqueKey: `${requestId || safeTitle}:${safeStatus}`,
                subject: `[Server Portal] Request ${safeStatus}: ${title || 'Media request'}`,
                html: simpleNoticeHtml({
                    title: 'Request update',
                    greeting: escapeHtmlAttr(resolveDisplayName(user)),
                    body: `<p>Your request for <strong>${safeTitle}</strong> is now <strong>${safeStatus}</strong>.</p>`,
                }),
            });
        } catch (error) {
            log?.(`Request update notice failed: ${error.message}`);
            return false;
        }
    };

    const notifyIssueReply = async (config, { issue, replyAuthor }) => {
        try {
            void discordNotifier?.notifyIssueReply(config, { issue, replyAuthor });
            const users = await loadFile(usersPath, []);
            const user = users.find((entry) => String(entry.id) === String(issue?.reporterId)
                || String(entry.plexId || '') === String(issue?.reporterId)) || null;
            if (!user || !wantsNotifyIssueReplies(user) || !getDeliveryEmail(user)) return false;
            if (String(replyAuthor || '').toLowerCase() === String(user.username || '').toLowerCase()) return false;
            const title = escapeHtmlAttr(issue?.title || issue?.mediaTitle || 'your issue');
            return sendMemberNotice(config, user, {
                type: 'issue_reply',
                uniqueKey: `${issue.id}:${issue.updatedAt || Date.now()}`,
                subject: `[Server Portal] New reply on your issue`,
                html: simpleNoticeHtml({
                    title: 'Issue reply',
                    greeting: escapeHtmlAttr(resolveDisplayName(user)),
                    body: `<p>There's a new reply on your issue for <strong>${title}</strong>.</p><p>Open the Issues tab in your User Portal to read it.</p>`,
                }),
            });
        } catch (error) {
            log?.(`Issue reply notice failed: ${error.message}`);
            return false;
        }
    };

    const checkWatchlistAvailability = async (config, requestAppService) => {
        if (!config?.smtpHost || !config?.smtpUser || !config?.smtpPass) return;
        const gate = requestAppService?.getRequestAppGate?.(config);
        if (!gate?.ready) return;

        const users = await loadFile(usersPath, []);
        const optedIn = users.filter((user) => wantsNotifyWatchlistAvailable(user) && getDeliveryEmail(user));
        if (!optedIn.length) return;

        let availableRequests = [];
        try {
            const page = await requestAppService.listRequests(config, { filter: 'available', take: 100, skip: 0 });
            availableRequests = Array.isArray(page?.results) ? page.results : [];
        } catch (error) {
            log?.(`Watchlist availability check skipped: ${error.message}`);
            return;
        }

        const discordPosted = new Set();
        for (const request of availableRequests) {
            const user = matchPortalUser(optedIn, request.requestedBy || {});
            if (!user) continue;
            const title = request.title || 'A requested title';
            const uniqueKey = String(request.id || `${title}:${request.updatedAt || ''}`);
            const sent = await sendMemberNotice(config, user, {
                type: 'watchlist_available',
                uniqueKey,
                subject: `[Server Portal] Now available: ${title}`,
                html: simpleNoticeHtml({
                    title: 'Now available',
                    greeting: escapeHtmlAttr(resolveDisplayName(user)),
                    body: `<p><strong>${escapeHtmlAttr(title)}</strong> from your requests is now available on the server.</p>`,
                }),
            });
            // Channel post once per newly delivered availability notice (email dedupe keys the event).
            if (sent && !discordPosted.has(uniqueKey)) {
                discordPosted.add(uniqueKey);
                void discordNotifier?.notifyWatchlistAvailable(config, {
                    title,
                    requestedBy: request.requestedBy || user,
                });
            }
        }
    };

    return {
        notifyRequestUpdate,
        notifyIssueReply,
        checkWatchlistAvailability,
    };
};
