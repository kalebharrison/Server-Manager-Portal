import { useEffect, useState } from 'react';

import { apiFetch } from '../shared/api';
import { getPublicOrigin, portalUrl, stripBasePath } from '../shared/basePath';
import { accentHoverRgb, hexToRgb } from '../shared/format';
import type { PlexServer } from '../shared/types';
import {
    BRAND_THEME_COLORS,
    readStoredSetupPlex,
    SETUP_PLEX_STORAGE_KEY,
    STEPS,
    type StepId,
    type StoredSetupPlex,
} from './setupWizardModel';
import type { IntegrationTab, SetupWizardForm } from './setupWizardTypes';

const createInitialForm = (stored: StoredSetupPlex | null): SetupWizardForm => ({
    token: stored?.token || '',
    mediaServerType: stored?.mediaServerType || 'plex',
    serverIdentifier: stored?.serverIdentifier || '',
    plexServerUrl: stored?.plexServerUrl || '',
    jellyfinUrl: stored?.jellyfinUrl || '',
    jellyfinApiKey: stored?.jellyfinApiKey || '',
    publicDomain: stored?.publicDomain ?? (typeof window !== 'undefined' ? getPublicOrigin() : ''),
    brandTheme: stored?.brandTheme ?? 'plex',
    primaryColor: stored?.primaryColor ?? BRAND_THEME_COLORS.plex,
    customLogoUrl: stored?.customLogoUrl ?? '',
    smtpHost: stored?.smtpHost ?? '',
    smtpPort: stored?.smtpPort ?? 587,
    smtpUser: stored?.smtpUser ?? '',
    smtpPass: stored?.smtpPass ?? '',
    smtpFrom: stored?.smtpFrom ?? '',
    smtpSecure: stored?.smtpSecure ?? false,
    sonarrUrl: stored?.sonarrUrl ?? '',
    sonarrApiKey: stored?.sonarrApiKey ?? '',
    radarrUrl: stored?.radarrUrl ?? '',
    radarrApiKey: stored?.radarrApiKey ?? '',
    tautulliUrl: stored?.tautulliUrl ?? '',
    tautulliApiKey: stored?.tautulliApiKey ?? '',
    jellystatUrl: stored?.jellystatUrl ?? '',
    jellystatApiKey: stored?.jellystatApiKey ?? '',
    requestAppType: stored?.requestAppType === 'overseerr' ? 'seerr' : (stored?.requestAppType ?? 'none'),
    requestAppUrl: stored?.requestAppUrl ?? '',
    requestAppApiKey: stored?.requestAppApiKey ?? '',
});

export const useSetupWizard = (onComplete: () => void) => {
    const [storedPlex] = useState(() => readStoredSetupPlex());
    const isOAuthReturn = typeof window !== 'undefined'
        && stripBasePath(window.location.pathname).startsWith('/auth/setup/');

    const [step, setStep] = useState<StepId>(() => {
        if (isOAuthReturn) return 'plex';
        if (storedPlex?.step) return storedPlex.step;
        if (storedPlex?.token) return 'plex';
        return 'welcome';
    });
    const [form, setForm] = useState<SetupWizardForm>(() => createInitialForm(storedPlex));
    const [servers, setServers] = useState<PlexServer[]>(storedPlex?.servers || []);
    const [plexUsername, setPlexUsername] = useState(storedPlex?.username || '');
    const [showManualToken, setShowManualToken] = useState(false);
    const [testRecipient, setTestRecipient] = useState('');
    const [integrationTab, setIntegrationTab] = useState<IntegrationTab>('arr');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const updateForm = (patch: Partial<SetupWizardForm>) => {
        setForm((current) => ({ ...current, ...patch }));
    };

    const applyBrandTheme = (theme: string) => {
        setForm((current) => ({
            ...current,
            brandTheme: theme,
            primaryColor: theme === 'plex' || theme === 'jellyfin'
                ? BRAND_THEME_COLORS[theme]
                : current.primaryColor,
        }));
    };

    const applyMediaServerType = (type: string) => {
        const nextType = type === 'jellyfin' ? 'jellyfin' : 'plex';
        setForm((current) => {
            const followsServerTheme = current.brandTheme === 'plex' || current.brandTheme === 'jellyfin';
            const followsServerRequestApp = ['none', 'seerr', 'overseerr', 'jellyseerr'].includes(current.requestAppType);
            return {
                ...current,
                mediaServerType: nextType,
                brandTheme: followsServerTheme ? nextType : current.brandTheme,
                primaryColor: followsServerTheme ? BRAND_THEME_COLORS[nextType] : current.primaryColor,
                requestAppType: followsServerRequestApp
                    ? (nextType === 'jellyfin' ? 'jellyseerr' : 'seerr')
                    : current.requestAppType,
            };
        });
    };

    useEffect(() => {
        document.documentElement.style.setProperty('--color-plex', hexToRgb(form.primaryColor));
        document.documentElement.style.setProperty('--color-plex-hover', accentHoverRgb(form.primaryColor));
    }, [form.primaryColor]);

    const persistSetup = (nextStep: StepId) => {
        const stored: StoredSetupPlex = {
            ...form,
            servers,
            username: plexUsername,
            step: nextStep,
        };
        sessionStorage.setItem(SETUP_PLEX_STORAGE_KEY, JSON.stringify(stored));
    };

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
    }, []);

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

    const handleTestEmail = async () => {
        if (!form.smtpHost || !form.smtpUser || !form.smtpPass || !testRecipient) {
            setError('Fill in SMTP host, user, password, and test recipient.');
            return;
        }
        setIsLoading(true);
        setError('');
        try {
            await apiFetch('/api/config/test-email', {
                method: 'POST',
                body: JSON.stringify({
                    smtpHost: form.smtpHost,
                    smtpPort: form.smtpPort,
                    smtpUser: form.smtpUser,
                    smtpPass: form.smtpPass,
                    smtpFrom: form.smtpFrom,
                    smtpSecure: form.smtpSecure,
                    testRecipient,
                }),
            });
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : 'Test email failed.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleComplete = async () => {
        setIsLoading(true);
        setError('');
        try {
            await apiFetch('/api/config', {
                method: 'POST',
                body: JSON.stringify({
                    ...form,
                    token: form.token.trim(),
                    serverIdentifier: form.serverIdentifier.trim(),
                    plexServerUrl: form.plexServerUrl || undefined,
                    brandTheme: undefined,
                }),
            });
            sessionStorage.removeItem(SETUP_PLEX_STORAGE_KEY);
            sessionStorage.removeItem('setupReturnPath');
            onComplete();
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : 'Failed to save configuration.');
            setIsLoading(false);
        }
    };

    const stepIndex = STEPS.findIndex((candidate) => candidate.id === step);
    const canGoNext = step !== 'plex'
        || (form.mediaServerType === 'jellyfin'
            ? Boolean(form.jellyfinUrl && form.jellyfinApiKey)
            : Boolean(form.token && form.serverIdentifier));

    const goNext = () => {
        if (stepIndex >= STEPS.length - 1) return;
        const nextStep = STEPS[stepIndex + 1].id;
        setStep(nextStep);
        if (form.token) persistSetup(nextStep);
    };

    const goBack = () => {
        if (stepIndex > 0) setStep(STEPS[stepIndex - 1].id);
    };

    return {
        step,
        stepIndex,
        form,
        updateForm,
        servers,
        plexUsername,
        showManualToken,
        setShowManualToken,
        testRecipient,
        setTestRecipient,
        integrationTab,
        setIntegrationTab,
        error,
        isLoading,
        canGoNext,
        applyBrandTheme,
        applyMediaServerType,
        handlePlexSignIn,
        handleFetchServers,
        handlePlexSignOut,
        handleTestEmail,
        handleComplete,
        goNext,
        goBack,
    };
};
