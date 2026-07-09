import { useCallback } from 'react';

import { apiFetch } from '../shared/api';
import type { PlexServer } from '../shared/types';

type AddToast = (message: string, type?: 'success' | 'error') => void;

type UsePlexServerDiscoveryOptions = {
    token: string;
    plexServerUrl: string;
    selectedServer: string;
    addToast: AddToast;
    setLoading: (value: boolean) => void;
    setServers: (servers: PlexServer[]) => void;
    setSelectedServer: (serverId: string) => void;
};

export const usePlexServerDiscovery = ({
    token,
    plexServerUrl,
    selectedServer,
    addToast,
    setLoading,
    setServers,
    setSelectedServer,
}: UsePlexServerDiscoveryOptions) => useCallback(async () => {
    if (!token) {
        addToast('Please enter a Plex token.', 'error');
        return;
    }
    setLoading(true);
    try {
        const foundServers: PlexServer[] = await apiFetch('/api/plex/servers', {
            method: 'POST',
            body: JSON.stringify({ token, plexServerUrl: plexServerUrl || undefined }),
        });

        setServers(foundServers);

        if (foundServers.length > 0) {
            addToast('Successfully fetched servers!', 'success');
            const currentServerStillExists = foundServers.some(s => s.identifier === selectedServer);
            if (!currentServerStillExists) {
                setSelectedServer(foundServers[0].identifier);
            }
        } else {
            addToast('No owned servers found for this token. Make sure you are the owner of the server.', 'error');
            setSelectedServer('');
        }
    } catch (error) {
        addToast(error instanceof Error ? error.message : 'An unknown error occurred.', 'error');
        setServers([]);
        setSelectedServer('');
    } finally {
        setLoading(false);
    }
}, [addToast, plexServerUrl, selectedServer, setLoading, setSelectedServer, setServers, token]);
