import path from 'path';
import {
    getDeliveryEmail,
    resolveDisplayName,
} from './user-profile.js';
import { CONFIG_DIR } from '../config/data-paths.js';
import { buildPortalEmailHtml } from '../comms/email-templates.js';
import { isSmtpReady } from '../comms/smtp-ready.js';

const REQUEST_FOOTER = 'Request approved and available notices are always sent.';
const ISSUE_FOOTER = 'Issue updates are always sent.';

const simpleNoticeHtml = ({ title, greeting, body, footer = 'Manage email preferences anytime in your User Portal.', heading }) => (
    buildPortalEmailHtml({
        title,
        footer,
        heading,
        bodyHtml: `<p>Hello <strong>${greeting}</strong>,</p>${body}`,
    })
);

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

const matchPortalUserById = (users, userId) => {
    const id = String(userId || '').trim();
    if (!id) return null;
    return users.find((user) => String(user.id) === id || String(user.plexId || '') === id) || null;
};

export const createMemberNotifications = ({
    usersPath,
    loadFile,
    sendMemberNotice,
    escapeHtmlAttr,
    discordNotifier = null,
    log,
    resolveIntegrationUrlForFetch = (url) => url,
}) => {
    const notifyRequestUpdate = async (config, { requestedBy, title, statusLabel, requestId }) => {
        try {
            const users = await loadFile(usersPath, []);
            const user = matchPortalUser(users, requestedBy || {});
            void discordNotifier?.notifyRequestUpdate(config, {
                title,
                statusLabel,
                requestId,
                discordId: user?.discordId || requestedBy?.discordId,
            });
            if (!user || !getDeliveryEmail(user)) return false;
            const safeTitle = escapeHtmlAttr(title || 'your request');
            const safeStatus = escapeHtmlAttr(statusLabel || 'updated');
            return sendMemberNotice(config, user, {
                type: 'request_update',
                uniqueKey: `${requestId || safeTitle}:${safeStatus}`,
                subject: `[Server Portal] Request ${safeStatus}: ${title || 'Media request'}`,
                html: simpleNoticeHtml({
                    title: 'Request update',
                    heading: config.serverIdentifier || 'Server Portal',
                    greeting: escapeHtmlAttr(resolveDisplayName(user)),
                    body: `<p>Your request for <strong>${safeTitle}</strong> is now <strong>${safeStatus}</strong>.</p>`,
                    footer: REQUEST_FOOTER,
                }),
            });
        } catch (error) {
            log?.(`Request update notice failed: ${error.message}`);
            return false;
        }
    };

    const notifyIssueReply = async (config, { issue, replyAuthor, statusLabel } = {}) => {
        try {
            const users = await loadFile(usersPath, []);
            const user = users.find((entry) => String(entry.id) === String(issue?.reporterId)
                || String(entry.plexId || '') === String(issue?.reporterId)) || null;
            const resolved = String(statusLabel || '').toLowerCase() === 'resolved';
            void discordNotifier?.notifyIssueReply(config, {
                issue,
                replyAuthor,
                statusLabel,
                discordId: user?.discordId,
            });
            if (!user || !getDeliveryEmail(user)) return false;
            if (!resolved && String(replyAuthor || '').toLowerCase() === String(user.username || '').toLowerCase()) {
                return false;
            }
            const title = escapeHtmlAttr(issue?.title || issue?.mediaTitle || 'your issue');
            return sendMemberNotice(config, user, {
                type: resolved ? 'issue_resolved' : 'issue_reply',
                uniqueKey: `${issue.id}:${resolved ? 'resolved' : (issue.updatedAt || Date.now())}`,
                subject: resolved
                    ? `[Server Portal] Issue resolved: ${issue?.title || 'your issue'}`
                    : '[Server Portal] New reply on your issue',
                html: simpleNoticeHtml({
                    title: resolved ? 'Issue resolved' : 'Issue reply',
                    heading: config.serverIdentifier || 'Server Portal',
                    greeting: escapeHtmlAttr(resolveDisplayName(user)),
                    body: resolved
                        ? `<p>Your issue for <strong>${title}</strong> was marked <strong>resolved</strong>.</p>`
                        : `<p>There's a new reply on your issue for <strong>${title}</strong>.</p><p>Open the Issues tab in your User Portal to read it.</p>`,
                    footer: ISSUE_FOOTER,
                }),
            });
        } catch (error) {
            log?.(`Issue reply notice failed: ${error.message}`);
            return false;
        }
    };

    const sendAvailableNotice = async (config, user, { title, uniqueKey, requestedBy }) => {
        const sent = await sendMemberNotice(config, user, {
            type: 'watchlist_available',
            uniqueKey: `${uniqueKey}:${user.id}`,
            subject: `[Server Portal] Now available: ${title}`,
            html: simpleNoticeHtml({
                title: 'Now available',
                heading: config.serverIdentifier || 'Server Portal',
                greeting: escapeHtmlAttr(resolveDisplayName(user)),
                body: `<p><strong>${escapeHtmlAttr(title)}</strong> is now available on the server.</p>`,
                footer: REQUEST_FOOTER,
            }),
        });
        return sent;
    };

    const checkPortalWatchlistAvailability = async (config) => {
        const { createPortalRequestService } = await import('../portal-request/portalRequestService.js');
        const users = await loadFile(usersPath, []);
        const service = createPortalRequestService({
            dataDir: path.join(CONFIG_DIR, 'requests'),
            config,
            resolveUrl: resolveIntegrationUrlForFetch,
            resolveUser: async (id) => users.find((user) => (
                String(user?.id) === String(id) || String(user?.plexId) === String(id)
            )) || null,
            listUsers: async () => users,
        });

        const candidates = await service.listAvailableNotifyCandidates().catch((error) => {
            log?.(`Portal availability notify skipped: ${error.message}`);
            return [];
        });
        if (!candidates.length) return;

        for (const request of candidates) {
            const title = request.title || 'A requested title';
            const baseKey = String(request.id || `${title}:${request.updatedAt || ''}`);
            const recipients = new Map();
            const owner = matchPortalUserById(users, request.userId);
            if (owner) recipients.set(String(owner.id), owner);
            for (const notifyId of request.notifyUserIds || []) {
                const subscriber = matchPortalUserById(users, notifyId);
                if (subscriber) recipients.set(String(subscriber.id), subscriber);
            }

            for (const user of recipients.values()) {
                if (user.discordId) {
                    void discordNotifier?.notifyWatchlistAvailable(config, {
                        title,
                        discordId: user.discordId,
                    });
                }
                if (getDeliveryEmail(user)) {
                    await sendAvailableNotice(config, user, {
                        title,
                        uniqueKey: baseKey,
                        requestedBy: owner || user,
                    });
                }
            }
        }
    };

    const checkWatchlistAvailability = async (config) => {
        const mailReady = isSmtpReady(config);
        const discordReady = !!(config?.discordEnabled && config?.discordNotifyWatchlistAvailable !== false);
        if (!mailReady && !discordReady) return;
        await checkPortalWatchlistAvailability(config);
    };

    return {
        notifyRequestUpdate,
        notifyIssueReply,
        checkWatchlistAvailability,
    };
};
