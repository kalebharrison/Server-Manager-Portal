import { useEffect, useRef, useState } from 'react';

import { apiFetch } from '../../shared/api';
import { portalUrl, stripBasePath } from '../../shared/basePath';
import { updateFavicon } from '../../shared/favicon';
import { copyTextToClipboard, jellyfinQuickConnectUrl } from './loginUtils';

export type PublicInfo = {
    thumb: string | null;
    serverName: string;
    isConfigured: boolean | null;
    mediaServerType?: string;
};

export const useLogin = ({
    onLoginSuccess,
    initialError,
}: {
    onLoginSuccess: () => void;
    initialError?: string;
}) => {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(initialError || '');
    const [jellyfinUsername, setJellyfinUsername] = useState('');
    const [jellyfinPassword, setJellyfinPassword] = useState('');
    const [showJellyfinPassword, setShowJellyfinPassword] = useState(false);
    const [quickConnect, setQuickConnect] = useState<{ sessionId: string, code: string, jellyfinUrl: string } | null>(null);
    const quickConnectPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const [publicInfo, setPublicInfo] = useState<PublicInfo>({ thumb: null, serverName: 'Server Portal', isConfigured: null, mediaServerType: 'plex' });

    const fetchPublicInfo = () => {
        apiFetch('/api/public/info').then(data => {
            if (data) {
                setPublicInfo({
                    thumb: data.thumb || null,
                    serverName: data.serverName || 'Server Portal',
                    isConfigured: data.isConfigured !== false,
                    mediaServerType: data.mediaServerType || 'plex'
                });
                if (data.thumb) updateFavicon(data.thumb);
                if (data.serverName) document.title = `${data.serverName} Portal`;
            }
        }).catch(() => {
            setPublicInfo(prev => ({ ...prev, isConfigured: false }));
        });
    };

    useEffect(() => {
        if (initialError) {
            window.history.replaceState({}, '', portalUrl('/'));
        }
    }, [initialError]);

    useEffect(() => () => {
        if (quickConnectPollRef.current) clearInterval(quickConnectPollRef.current);
    }, []);

    useEffect(() => {
        fetchPublicInfo();

        const path = stripBasePath(window.location.pathname);
        const params = new URLSearchParams(window.location.search);
        const loginError = params.get('loginError');
        if (loginError) {
            setError(loginError);
            window.history.replaceState({}, '', portalUrl('/'));
            return;
        }

        if (path.startsWith('/auth/setup/')) {
            return;
        }

        if (path.startsWith('/auth/')) {
            const pinId = path.split('/')[2];
            setIsLoading(true);
            window.history.replaceState({}, '', portalUrl('/'));
            apiFetch('/api/auth/plex/callback', {
                method: 'POST',
                body: JSON.stringify({ pinId }),
            }).then(() => onLoginSuccess()).catch(e => {
                setError(e.message || 'Login failed');
            }).finally(() => {
                setIsLoading(false);
            });
        }
    }, [onLoginSuccess]);

    const handlePlexLogin = async () => {
        setIsLoading(true);
        setError('');
        try {
            const data = await apiFetch('/api/auth/plex/login', { method: 'POST' });
            const clientId = data.clientIdentifier || data.clientId || '';
            const forwardUrl = window.location.origin + portalUrl('/api/auth/plex/callback?pinId=' + data.id);
            const authUrl = `https://app.plex.tv/auth#?clientID=${encodeURIComponent(clientId)}&code=${data.code}&context[device][product]=Server%20Manager%20Portal&forwardUrl=${encodeURIComponent(forwardUrl)}`;
            window.location.href = authUrl;
        } catch (e) {
            setError('Failed to initiate Plex login');
            setIsLoading(false);
        }
    };

    const handleJellyfinLogin = async (event?: React.FormEvent) => {
        event?.preventDefault();
        setIsLoading(true);
        setError('');
        try {
            await apiFetch('/api/auth/jellyfin/login', {
                method: 'POST',
                body: JSON.stringify({ username: jellyfinUsername.trim(), password: jellyfinPassword }),
            });
            onLoginSuccess();
        } catch (e: any) {
            setError(e.message || 'Failed to authenticate with Jellyfin');
        } finally {
            setIsLoading(false);
        }
    };

    const stopQuickConnectPolling = () => {
        if (quickConnectPollRef.current) {
            clearInterval(quickConnectPollRef.current);
            quickConnectPollRef.current = null;
        }
    };

    const pollJellyfinQuickConnect = (sessionId: string) => {
        stopQuickConnectPolling();
        quickConnectPollRef.current = setInterval(async () => {
            try {
                const data = await apiFetch('/api/auth/jellyfin/quick-connect/poll', {
                    method: 'POST',
                    body: JSON.stringify({ sessionId }),
                });
                if (data?.success) {
                    stopQuickConnectPolling();
                    onLoginSuccess();
                }
            } catch (e: any) {
                stopQuickConnectPolling();
                setIsLoading(false);
                setError(e.message || 'Jellyfin Quick Connect failed');
            }
        }, 5000);
    };

    const handleJellyfinQuickConnect = async () => {
        setIsLoading(true);
        setError('');
        try {
            const data = await apiFetch('/api/auth/jellyfin/quick-connect/initiate', { method: 'POST' });
            setQuickConnect({
                sessionId: data.sessionId,
                code: data.code,
                jellyfinUrl: data.jellyfinUrl || '',
            });
            setIsLoading(false);
            pollJellyfinQuickConnect(data.sessionId);
        } catch (e: any) {
            setIsLoading(false);
            setError(e.message || 'Failed to start Jellyfin Quick Connect');
        }
    };

    const handleOpenJellyfinQuickConnect = async () => {
        if (!quickConnect?.jellyfinUrl) return;
        try {
            await copyTextToClipboard(quickConnect.code);
        } catch {
            // Clipboard access can be blocked by browser settings; opening Jellyfin is still useful.
        }
        window.open(jellyfinQuickConnectUrl(quickConnect.jellyfinUrl), '_blank', 'noopener,noreferrer');
    };

    return {
        isLoading,
        error,
        jellyfinUsername,
        setJellyfinUsername,
        jellyfinPassword,
        setJellyfinPassword,
        showJellyfinPassword,
        setShowJellyfinPassword,
        quickConnect,
        publicInfo,
        fetchPublicInfo,
        handlePlexLogin,
        handleJellyfinLogin,
        handleJellyfinQuickConnect,
        handleOpenJellyfinQuickConnect,
    };
};

export type LoginState = ReturnType<typeof useLogin>;
