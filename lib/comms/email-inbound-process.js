import { randomUUID } from 'crypto';

import { createJsonRequestStore } from '../portal-request/requestStore.js';
import { getDeliveryEmail } from '../users/user-profile.js';
import { extractEmailAddress } from './email-recipients.js';
import {
    extractInboundReplyBody,
    inboundMessageId,
    listInboundRecipientCandidates,
    parseInboundRecipient,
} from './email-inbound.js';

const senderMatchesUser = (user, sender) => {
    const target = extractEmailAddress(sender);
    if (!target || !user) return false;
    return [getDeliveryEmail(user), user.email, user.contactEmail]
        .map((value) => extractEmailAddress(value))
        .filter(Boolean)
        .includes(target);
};

const matchIssueReporter = (users, issue) => {
    const reporterId = String(issue?.reporterId || '');
    if (!reporterId) return null;
    return (Array.isArray(users) ? users : []).find((user) => (
        String(user.id) === reporterId || String(user.plexId || '') === reporterId
    )) || null;
};

const matchRequestOwner = (users, record) => {
    const userId = String(record?.userId || '');
    if (!userId) return null;
    return (Array.isArray(users) ? users : []).find((user) => (
        String(user.id) === userId || String(user.plexId || '') === userId
    )) || null;
};

const applyIssueReply = async ({
    issuePath,
    loadFile,
    saveFile,
    users,
    sender,
    body,
    messageId,
    issueId,
    discordNotifier,
    config,
    log,
}) => {
    const issues = await loadFile(issuePath, []);
    const index = issues.findIndex((item) => String(item?.id) === String(issueId));
    if (index < 0) return { ok: true, skipped: 'missing-issue' };
    const issue = issues[index];
    if (issue.source && issue.source !== 'portal') return { ok: true, skipped: 'unsupported-issue' };
    const user = matchIssueReporter(users, issue);
    if (!senderMatchesUser(user, sender)) return { ok: true, skipped: 'sender-mismatch' };

    const comments = Array.isArray(issue.comments) ? issue.comments : [];
    if (messageId && comments.some((comment) => comment.inboundMessageId === messageId)) {
        return { ok: true, skipped: 'duplicate' };
    }

    const now = new Date().toISOString();
    const comment = {
        id: randomUUID(),
        message: body,
        createdAt: now,
        author: user.username || user.email || 'Member',
        inboundMessageId: messageId || undefined,
        via: 'email',
    };
    issues[index] = { ...issue, comments: [...comments, comment], updatedAt: now };
    await saveFile(issuePath, issues);
    void discordNotifier?.postAdminEvent?.(config, {
        title: 'Email reply on issue',
        description: `**${comment.author}** replied to **${issue.title || issueId}** via email.`,
        color: 0x5865f2,
    }).catch((error) => log?.(`[inbound-email] admin notify failed: ${error.message}`));
    return { ok: true, applied: 'issue', id: issueId };
};

const applyRequestReply = async ({
    requestsDir,
    users,
    sender,
    body,
    messageId,
    requestId,
    discordNotifier,
    config,
    log,
}) => {
    const store = createJsonRequestStore({ dataDir: requestsDir });
    const record = await store.get(requestId);
    if (!record) return { ok: true, skipped: 'missing-request' };
    const user = matchRequestOwner(users, record);
    if (!senderMatchesUser(user, sender)) return { ok: true, skipped: 'sender-mismatch' };

    const replies = Array.isArray(record.meta?.emailReplies) ? record.meta.emailReplies : [];
    if (messageId && replies.some((entry) => entry.inboundMessageId === messageId)) {
        return { ok: true, skipped: 'duplicate' };
    }

    const now = new Date().toISOString();
    const entry = {
        id: randomUUID(),
        message: body,
        createdAt: now,
        author: user.username || user.email || 'Member',
        inboundMessageId: messageId || undefined,
        via: 'email',
    };
    await store.update(requestId, {
        meta: {
            ...(record.meta || {}),
            emailReplies: [...replies, entry],
        },
    });
    void discordNotifier?.postAdminEvent?.(config, {
        title: 'Email reply on request',
        description: `**${entry.author}** replied to **${record.title || requestId}** via email.`,
        color: 0x5865f2,
    }).catch((error) => log?.(`[inbound-email] admin notify failed: ${error.message}`));
    return { ok: true, applied: 'request', id: String(requestId) };
};

export const processMailjetInbound = async ({
    config,
    payload = {},
    loadFile,
    saveFile,
    usersPath,
    issuePath,
    requestsDir,
    discordNotifier = null,
    log = () => {},
}) => {
    const secret = String(config?.mailjetInboundSecret || '').trim();
    let thread = null;
    for (const candidate of listInboundRecipientCandidates(payload)) {
        thread = parseInboundRecipient(candidate, secret);
        if (thread) break;
    }
    if (!thread) return { ok: true, skipped: 'invalid-recipient' };

    const body = extractInboundReplyBody(
        payload['Text-part'] || payload.TextPart || payload['text-part'] || '',
    );
    const sender = payload.Sender || payload.From || '';
    if (thread.kind === 'test') {
        log(`[inbound-email] SMTP test reply from ${extractEmailAddress(sender) || 'unknown'}: ${body.slice(0, 120)}`);
        void discordNotifier?.postAdminEvent?.(config, {
            title: 'Inbound email test reply',
            description: `Reply from **${extractEmailAddress(sender) || 'unknown'}** reached the portal.`,
            color: 0x22c55e,
        }).catch((error) => log?.(`[inbound-email] admin notify failed: ${error.message}`));
        return { ok: true, applied: 'test', id: thread.id };
    }
    if (body.length < 2) return { ok: true, skipped: 'empty-body' };

    const users = await loadFile(usersPath, []);
    const messageId = inboundMessageId(payload);
    const shared = {
        users, sender, body, messageId, discordNotifier, config, log,
    };
    if (thread.kind === 'issue') {
        return applyIssueReply({
            ...shared, issuePath, loadFile, saveFile, issueId: thread.id,
        });
    }
    if (thread.kind === 'request') {
        return applyRequestReply({
            ...shared, requestsDir, requestId: thread.id,
        });
    }
    return { ok: true, skipped: 'unknown-kind' };
};
