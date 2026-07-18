export const createJellyfinHttp = ({ getClientId, appVersion }) => {
    const jellyfinAuthBase = () => ([
        'MediaBrowser Client="Server Manager Portal"',
        'Device="Web"',
        `DeviceId="${getClientId()}"`,
        `Version="${appVersion}"`,
    ].join(', '));

    const jellyfinAuthorizationHeader = (token = '') => (
        token ? `${jellyfinAuthBase()}, Token="${token}"` : jellyfinAuthBase()
    );

    const jellyfinHeaders = (token = '', extra = {}) => ({
        Accept: 'application/json',
        'X-Emby-Authorization': jellyfinAuthorizationHeader(token),
        ...(token ? { 'X-Emby-Token': token } : {}),
        ...extra,
    });

    const jellyfinItemUrl = (config, itemId) => {
        const baseUrl = String(config?.jellyfinUrl || '').replace(/\/+$/, '');
        return baseUrl && itemId ? `${baseUrl}/web/#/details?id=${encodeURIComponent(itemId)}` : baseUrl;
    };

    return {
        jellyfinAuthorizationHeader,
        jellyfinHeaders,
        jellyfinItemUrl,
    };
};
