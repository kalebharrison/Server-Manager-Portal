import { createMediaIssueSync } from './media-issue-sync.js';
import { registerMediaIssueMemberRoutes } from './media-issue-member-routes.js';
import { registerMediaIssueAdminRoutes } from './media-issue-admin-routes.js';

export const registerMediaIssueRoutes = ({
    app,
    requireAuth,
    requireMember,
    requireAdmin,
    memberApiRateLimit = null,
    configPath,
    issuePath,
    loadFile,
    saveFile,
    fetch,
    resolveIntegrationUrlForFetch,
    getPlexConnectionUri,
    appendAuditLog,
    notifyIssueReply = null,
    log,
}) => {
    const {
        loadIssues,
        findAndSearch,
        plexGraphql,
        syncExternalIssues,
    } = createMediaIssueSync({
        issuePath,
        loadFile,
        saveFile,
        fetch,
        resolveIntegrationUrlForFetch,
        getPlexConnectionUri,
        log,
    });

    registerMediaIssueMemberRoutes({
        app,
        requireAuth,
        requireMember,
        memberApiRateLimit,
        configPath,
        issuePath,
        loadFile,
        saveFile,
        loadIssues,
        plexGraphql,
        syncExternalIssues,
        appendAuditLog,
        notifyIssueReply,
    });

    registerMediaIssueAdminRoutes({
        app,
        requireAdmin,
        configPath,
        issuePath,
        loadFile,
        saveFile,
        loadIssues,
        findAndSearch,
        appendAuditLog,
        notifyIssueReply,
    });
};
