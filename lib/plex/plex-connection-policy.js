import fsSync from 'fs';

export const isLoopbackPlexUri = (uri = '') => {
    try {
        const { hostname } = new URL(uri);
        return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
    } catch {
        return false;
    }
};

export const runningInDocker = fsSync.existsSync('/.dockerenv');

export const shouldPreferRemotePlexConnection = () => {
    const override = String(process.env.PLEX_PREFER_REMOTE_CONNECTION || '').toLowerCase();
    if (override === 'true') return true;
    if (override === 'false') return false;
    // Inside Docker, Plex "local" URLs usually mean the container loopback — not the host.
    return runningInDocker;
};

export const pickPlexConnection = (connections = []) => {
    if (!Array.isArray(connections) || connections.length === 0) return null;
    if (shouldPreferRemotePlexConnection()) {
        const remote = connections.find(c => !c.local && !isLoopbackPlexUri(c.uri));
        if (remote) return remote;
        const nonLoopback = connections.find(c => !isLoopbackPlexUri(c.uri));
        if (nonLoopback) return nonLoopback;
    }
    return connections.find(c => c.local) || connections[0];
};
