import { useEffect, useState } from 'react';

import { apiFetch } from '../shared/api';
import { portalUrl, stripBasePath } from '../shared/basePath';
import type { PlexServer } from '../shared/types';
import {
    SETUP_PLEX_STORAGE_KEY,
    type StepId,
    type StoredSetupPlex,
} from './setupWizardModel';
import type { SetupWizardForm } from './setupWizardTypes';

type UseSetupWizardPlexOptions = {
    form: SetupWizardForm;
    updateForm: (patch: Partial<SetupWizardForm>) => void;
    setStep: (step: StepId) => void;
    setIsLoading: (value: boolean) => void;
    setError: (value: string) => void;
    initialServers: PlexServer[];
    initialUsername: string;
};

export const useSetupWizardPlex = ({
    form,
    updateForm,
    setStep,
    setIsLoading,
    setError,
    initialServers,
    initialUsername,
}: UseSetupWizardPlexOptions) => {
    const [servers, setServers] = useState<PlexServer[]>(initialServers);
    const [plexUsername, setPlexUsername] = useState(initialUsername);

    useEffect(() => {
        const path = stripBasePath(window.location.pathname);
        if (!path.startsWith('/auth/setup/')) return;

        const pinId = path.split('/').filter(Boolean).pop();
        if (!pinId || pinId === 'setup') return;

        const returnPath = sessionStorage.getItem('setupReturnPath') || portalUrl('/');
        setIsLoading(true);
        setError('');
        setStep('plex');

        apiFetch('/api/setup/plex/callback', {
            method: 'POST',
            body: JSON.stringify({ pinId }),
        }).then((data) => {
            const nextServers = data.servers || [];
            const next = {
                token: data.token,
                servers: nextServers,
                serverIdentifier: nextServers[0]?.identifier || '',
                username: data.username || '',
                step: 'plex' as StepId,
            };
            sessionStorage.setItem(SETUP_PLEX_STORAGE_KEY, JSON.stringify(next));
            updateForm({ token: next.token, serverIdentifier: next.serverIdentifier });
            setServers(next.servers);
            setPlexUsername(next.username);
        }).catch((caught) => {
            setError(caught instanceof Error ? caught.message : 'Plex sign-in failed');
        }).finally(() => {
            sessionStorage.removeItem('setupReturnPath');
            window.history.replaceState({}, '', returnPath);
            setIsLoading(false);
        });
    }, [setError, setIsLoading, setStep, updateForm]);

    const handlePlexSignIn = async () => {
        setIsLoading(true);
        setError('');
        try {
            sessionStorage.setItem('setupReturnPath', window.location.pathname + window.location.search);
            sessionStorage.setItem(SETUP_PLEX_STORAGE_KEY, JSON.stringify({ step: 'plex' }));
            const data = await apiFetch('/api/auth/plex/login', { method: 'POST' });
            const clientId = data.clientIdentifier || data.clientId || '';
            const forwardUrl = `${window.location.origin}${portalUrl(`/auth/setup/${data.id}`)}`;
            const authUrl = `https://app.plex.tv/auth#?clientID=${encodeURIComponent(clientId)}&code=${data.code}&context[device][product]=Server%20Manager%20Portal&forwardUrl=${encodeURIComponent(forwardUrl)}`;
            window.location.href = authUrl;
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : 'Failed to start Plex sign-in');
            setIsLoading(false);
        }
    };

    const handleFetchServers = async () => {
        if (!form.token) {
            setError('Please enter a Plex token first.');
            return;
        }
        setIsLoading(true);
        setError('');
        try {
            const foundServers = await apiFetch('/api/plex/servers', {
                method: 'POST',
                body: JSON.stringify({
                    token: form.token.trim(),
                    plexServerUrl: form.plexServerUrl || undefined,
                }),
            });
            setServers(foundServers);
            if (foundServers.length > 0) {
                updateForm({ serverIdentifier: foundServers[0].identifier });
            } else {
                setError('No owned servers found for this token.');
                updateForm({ serverIdentifier: '' });
            }
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : 'Failed to fetch servers.');
            setServers([]);
            updateForm({ serverIdentifier: '' });
        } finally {
            setIsLoading(false);
        }
    };

    const handlePlexSignOut = () => {
        updateForm({ token: '', serverIdentifier: '' });
        setServers([]);
        setPlexUsername('');
        sessionStorage.removeItem(SETUP_PLEX_STORAGE_KEY);
    };

    const persistPlexSetup = (nextStep: StepId) => {
        const stored: StoredSetupPlex = {
            ...form,
            servers,
            username: plexUsername,
            step: nextStep,
        };
        sessionStorage.setItem(SETUP_PLEX_STORAGE_KEY, JSON.stringify(stored));
    };

    return {
        servers,
        plexUsername,
        handlePlexSignIn,
        handleFetchServers,
        handlePlexSignOut,
        persistPlexSetup,
    };
};
