import path from 'path';
import {
    getDeliveryEmail,
    resolveDisplayName,
} from './user-profile.js';
import { CONFIG_DIR } from '../config/data-paths.js';
import {
    buildPortalIssuesUrl,
    buildPortalMediaUrl,
    buildPortalRequestsUrl,
    emailNoticeSubject,
    emailStatusLabel,
    emailSubject,
    resolveEmailPosterUrl,
} from '../comms/email-identity.js';
import { buildMemberNoticeHtml } from '../comms/email-templates.js';
import { buildPlexWatchUrl } from '../media/library-deep-link.js';
import { isSmtpReady } from '../comms/smtp-ready.js';

const REQUEST_FOOTER = 'Request Approved and Now Available notices are always sent.';
const ISSUE_FOOTER = 'Issue updates are always sent.';

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
    getPlexConnectionUri = async () => null,
}) => {
    const resolveWatchLinks = async (config, query) => {
        try {
            const { createLibraryDeepLinkResolver } = await import('../media/library-deep-link.js');
            const resolver = createLibraryDeepLinkResolver({
                getPlexConnectionUri,
                resolveIntegrationUrlForFetch,
            });
            return await resolver.resolve(config, query);
        } catch {
            return [];
        }
    };

    const notifyRequestUpdate = async (config, {
        requestedBy, title, statusLabel, requestId, mediaType, tmdbId, posterPath,
    }) => {
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
            const status = emailStatusLabel(statusLabel);
            const portalUrl = buildPortalMediaUrl(config, { mediaType, tmdbId });
            const requestsUrl = buildPortalRequestsUrl(config);
            const posterUrl = resolveEmailPosterUrl(config, posterPath);
            return sendMemberNotice(config, user, {
                type: 'request_update',
                uniqueKey: `${requestId || safeTitle}:${status}`,
                subject: emailNoticeSubject(config, `Request ${status}`, title || 'Media Request'),
                html: buildMemberNoticeHtml({
                    config,
                    title: `Request ${status}`,
                    greeting: escapeHtmlAttr(resolveDisplayName(user)),
                    footer: REQUEST_FOOTER,
                    posterUrl,
                    posterHref: portalUrl,
                    bodyHtml: `<p style="margin:0;">Your request for <strong>${safeTitle}</strong> is now <strong>${escapeHtmlAttr(status)}</strong>.</p>`,
                    links: [
                        portalUrl ? { label: 'Open in Portal', url: portalUrl } : null,
                        requestsUrl ? { label: 'My Requests', url: requestsUrl } : null,
                    ].filter(Boolean),
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
            const portalUrl = buildPortalMediaUrl(config, {
                mediaType: issue?.mediaType,
                tmdbId: issue?.tmdbId,
            });
            const issuesUrl = buildPortalIssuesUrl(config);
            const plexUrl = buildPlexWatchUrl(config?.serverIdentifier, issue?.ratingKey);
            const posterUrl = resolveEmailPosterUrl(config, issue?.posterPath || issue?.posterUrl || issue?.thumbUrl);
            return sendMemberNotice(config, user, {
                type: resolved ? 'issue_resolved' : 'issue_reply',
                uniqueKey: `${issue.id}:${resolved ? 'resolved' : (issue.updatedAt || Date.now())}`,
                subject: resolved
                    ? emailNoticeSubject(config, 'Issue Resolved', issue?.title || 'Your Issue')
                    : emailSubject(config, 'New Reply on Your Issue'),
                html: buildMemberNoticeHtml({
                    config,
                    title: resolved ? 'Issue Resolved' : 'Issue Reply',
                    greeting: escapeHtmlAttr(resolveDisplayName(user)),
                    footer: ISSUE_FOOTER,
                    posterUrl,
                    posterHref: portalUrl,
                    bodyHtml: resolved
                        ? `<p style="margin:0;">Your issue for <strong>${title}</strong> was marked <strong>Resolved</strong>.</p>`
                        : `<p style="margin:0 0 12px;">There's a new reply on your issue for <strong>${title}</strong>.</p><p style="margin:0;">Open My Issues in Server Portal to read it.</p>`,
                    links: [
                        portalUrl ? { label: 'Open in Portal', url: portalUrl } : null,
                        issuesUrl ? { label: 'My Issues', url: issuesUrl } : null,
                        plexUrl ? { label: 'Watch on Plex', url: plexUrl } : null,
                    ].filter(Boolean),
                }),
            });
        } catch (error) {
            log?.(`Issue reply notice failed: ${error.message}`);
            return false;
        }
    };

    const sendAvailableNotice = async (config, user, { title, uniqueKey, mediaType, tmdbId, posterPath }) => {
        const portalUrl = buildPortalMediaUrl(config, { mediaType, tmdbId });
        const watchLinks = await resolveWatchLinks(config, { mediaType, tmdbId, title });
        const posterUrl = resolveEmailPosterUrl(config, posterPath);
        return sendMemberNotice(config, user, {
            type: 'watchlist_available',
            uniqueKey: `${uniqueKey}:${user.id}`,
            subject: emailNoticeSubject(config, 'Now Available', title),
            html: buildMemberNoticeHtml({
                config,
                title: 'Now Available',
                greeting: escapeHtmlAttr(resolveDisplayName(user)),
                footer: REQUEST_FOOTER,
                posterUrl,
                posterHref: portalUrl,
                bodyHtml: `<p style="margin:0;"><strong>${escapeHtmlAttr(title)}</strong> is now available to watch.</p>`,
                links: [
                    portalUrl ? { label: 'Open in Portal', url: portalUrl } : null,
                    ...watchLinks.map((link) => ({
                        label: link.label === 'Plex' ? 'Watch on Plex' : `Watch on ${link.label}`,
                        url: link.url,
                    })),
                ].filter(Boolean),
            }),
        });
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
                        mediaType: request.mediaType,
                        tmdbId: request.tmdbId,
                        posterPath: request.posterPath,
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
