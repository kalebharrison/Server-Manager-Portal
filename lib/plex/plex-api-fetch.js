export const createPlexApiFetch = (getClientId) => (url, token, options = {}) => {
    const headers = {
        Accept: 'application/json',
        ...(options.headers || {}),
        'X-Plex-Token': token,
        'X-Plex-Client-Identifier': getClientId(),
    };
    return fetch(url, { ...options, headers });
};
