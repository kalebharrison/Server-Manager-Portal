import { useEffect, useState } from 'react';

import { apiFetch } from '../shared/api';
import { stripBasePath } from '../shared/basePath';
import { accentHoverRgb, hexToRgb } from '../shared/format';
import {
    BRAND_THEME_COLORS,
    readStoredSetupPlex,
    SETUP_PLEX_STORAGE_KEY,
    STEPS,
    type StepId,
} from './setupWizardModel';
import { createInitialSetupWizardForm } from './setupWizardInitialForm';
import type { IntegrationTab, SetupWizardForm } from './setupWizardTypes';
import { useSetupWizardPlex } from './useSetupWizardPlex';

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
    const [form, setForm] = useState<SetupWizardForm>(() => createInitialSetupWizardForm(storedPlex));
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
            return {
                ...current,
                mediaServerType: nextType,
                brandTheme: followsServerTheme ? nextType : current.brandTheme,
                primaryColor: followsServerTheme ? BRAND_THEME_COLORS[nextType] : current.primaryColor,
            };
        });
    };

    useEffect(() => {
        document.documentElement.style.setProperty('--color-plex', hexToRgb(form.primaryColor));
        document.documentElement.style.setProperty('--color-plex-hover', accentHoverRgb(form.primaryColor));
    }, [form.primaryColor]);

    const {
        servers,
        plexUsername,
        handlePlexSignIn,
        handleFetchServers,
        handlePlexSignOut,
        persistPlexSetup,
    } = useSetupWizardPlex({
        form,
        updateForm,
        setStep,
        setIsLoading,
        setError,
        initialServers: storedPlex?.servers || [],
        initialUsername: storedPlex?.username || '',
    });

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
                    smtpEnabled: !!(form.smtpHost && form.smtpUser && form.smtpPass),
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
        if (form.token) persistPlexSetup(nextStep);
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
