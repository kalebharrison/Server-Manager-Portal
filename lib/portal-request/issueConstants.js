export const IssueType = {
    VIDEO: 1,
    AUDIO: 2,
    SUBTITLES: 3,
    OTHER: 4,
};

export const IssueStatus = {
    OPEN: 1,
    RESOLVED: 2,
};

export const issueTypeLabel = (type) => {
    const value = Number(type);
    if (value === IssueType.VIDEO) return 'Video';
    if (value === IssueType.AUDIO) return 'Audio';
    if (value === IssueType.SUBTITLES) return 'Subtitles';
    if (value === IssueType.OTHER) return 'Other';
    return 'Unknown';
};

export const issueStatusLabel = (status) => {
    const value = Number(status);
    if (value === IssueStatus.OPEN) return 'open';
    if (value === IssueStatus.RESOLVED) return 'resolved';
    return 'unknown';
};

export const isOpenIssue = (issue) => Number(issue?.status) === IssueStatus.OPEN;
