export const presentStreamUser = ({ isAdmin = false, mode = 'anonymous', username, thumb = null } = {}) => {
    if (isAdmin) return { user: username || 'Unknown User', userThumb: thumb };
    if (mode === 'hidden') return { user: null, userThumb: null };
    return { user: 'Anonymous', userThumb: null };
};
