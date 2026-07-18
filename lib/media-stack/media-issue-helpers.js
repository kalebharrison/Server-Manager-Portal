import { randomUUID } from 'crypto';

export const cleanText = (value, max = 2000) => String(value || '').trim().slice(0, max);
export const reporterId = (user = {}) => String(user.id || user.plexAccountId || user.email || user.username || 'unknown');
export const memberSafeMessage = (value) => String(value || '').replace(/^Reported from Server Manager Portal by[^\n]*\n+/i, '').trim();
export const safeAssetPath = (value) => {
    const path = cleanText(value, 1000);
    return path.startsWith('/') && !path.startsWith('//') ? path : null;
};
export const PLEX_REPORTS_QUERY = `query getReportedIssues($first: PaginationInt!, $after: String) {
  reports(after: $after, first: $first) {
    nodes { id message user { id username displayName } url date commentCount }
    pageInfo { hasNextPage endCursor }
  }
}`;
export const PLEX_REPORT_COMMENTS_QUERY = `query reportComments($id: ID!, $first: PaginationInt) {
  reportComments(id: $id, first: $first) {
    nodes { id message date status user { id username displayName } }
  }
}`;
export const PLEX_CREATE_COMMENT_MUTATION = `mutation createReportComment($input: CreateReportCommentInput!) {
  createReportComment(input: $input) { id message date status user { id username displayName } }
}`;

export const normalizeSeerrIssue = (issue) => ({
    id: `seerr:${issue.id}`,
    source: 'seerr',
    sourceId: String(issue.id),
    status: Number(issue.status) === 2 ? 'resolved' : 'open',
    issueType: Number(issue.issueType) || 4,
    title: issue.media?.title || issue.media?.name || 'Media issue',
    mediaType: issue.media?.mediaType || 'media',
    tmdbId: issue.media?.tmdbId || null,
    posterPath: issue.media?.posterPath || null,
    message: issue.comments?.[0]?.message || '',
    commentCount: Math.max(0, (issue.comments?.length || 0) - 1),
    createdAt: issue.createdAt || null,
    updatedAt: issue.updatedAt || issue.createdAt || null,
    reporter: issue.createdBy?.displayName || issue.createdBy?.username || null,
});

export const titleKey = (value) => cleanText(value, 300).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export const normalizeComments = (comments = [], isAdmin = false) => comments.map((comment) => ({
    id: String(comment.id || randomUUID()),
    message: cleanText(comment.message),
    createdAt: comment.createdAt || comment.date || null,
    author: isAdmin ? cleanText(comment.author || comment.user?.displayName || comment.user?.username, 200) || null : null,
}));

export const plexRatingKeyFromUrl = (value) => {
    let decoded = String(value || '');
    for (let attempt = 0; attempt < 3; attempt++) {
        const match = decoded.match(/\/library\/metadata\/(\d+)/i);
        if (match) return match[1];
        try {
            const next = decodeURIComponent(decoded);
            if (next === decoded) break;
            decoded = next;
        } catch {
            break;
        }
    }
    return null;
};
