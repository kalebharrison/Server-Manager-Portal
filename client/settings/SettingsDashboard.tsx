import React, { useState, useEffect, useCallback, useRef } from 'react';
import { apiFetch } from '../shared/api';
import { portalUrl } from '../shared/basePath';
import { pushToast, type ToastMessage } from '../shared/toast';
import type { PlexServer } from '../shared/types';
import { DEFAULT_DASHBOARD_LAYOUT, type DashboardLayoutConfig } from '../shared/dashboardLayout';
import { hasIntegrationCredentials } from './integrationDisplay';
import { getDefaultSettingsNavOrder } from './settingsNavOrder';
import { hydrateSettingsFromConfig } from './settingsInitializers';
import { buildSettingsSavePayload } from './settingsSavePayload';
import { buildSettingsTabPanelProps } from './settingsTabPanelProps';
import { SettingsPageLayout } from './SettingsPageLayout';
import { usePlexServerDiscovery } from './usePlexServerDiscovery';
import { useSettingsEmailActions } from './useSettingsEmailActions';
import { useSettingsAdminPanel } from './useSettingsAdminPanel';
import { useSettingsTabs } from './useSettingsTabs';
import { useSettingsResources } from './useSettingsResources';

export const SettingsDashboard: React.FC = () => {
    const [statusDraft, setStatusDraft] = useState<any>(null);
    const [isLoading, setLoading] = useState(true);
    const [configLoadError, setConfigLoadError] = useState<string | null>(null);
    const [initialSettings, setInitialSettings] = useState<any>({});
    const [isConfigLoaded, setIsConfigLoaded] = useState(false);
    const [toasts, setToasts] = useState<ToastMessage[]>([]);
    const streamRulesSaveHandlerRef = useRef<(() => Promise<boolean>) | null>(null);

    const addToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
        setToasts(t => pushToast(t, message, type));
    }, []);

    useEffect(() => {
        const fetchConfig = async () => {
            setLoading(true);
            setConfigLoadError(null);
            try {
                const configData = await apiFetch('/api/config');
                if (configData.settings) {
                    setInitialSettings(configData.settings);
                }
                setIsConfigLoaded(true);
            } catch (error) {
                const message = error instanceof Error ? error.message : 'Failed to load config';
                setConfigLoadError(message);
                addToast(message, 'error');
            } finally {
                setLoading(false);
            }
        };
        fetchConfig();
    }, [addToast]);

    const handleSaveConfig = async (newConfig: any) => {
        setLoading(true);
        try {
            await apiFetch('/api/config', { method: 'POST', body: JSON.stringify(newConfig) });
            const configData = await apiFetch('/api/config');
            if (configData.settings) {
                setInitialSettings(configData.settings);
            }
            window.dispatchEvent(new CustomEvent('portal-public-config-updated'));
            addToast('Settings Saved!');
        } catch (e: any) {
            addToast(e.message || 'Failed to save config', 'error');
        } finally {
            setLoading(false);
        }
    };
    const [token, setToken] = useState('');
    const [mediaServerType, setMediaServerType] = useState<'plex' | 'jellyfin'>('plex');
    const [plexServerUrl, setPlexServerUrl] = useState('');
    const [jellyfinUrl, setJellyfinUrl] = useState('');
    const [jellyfinApiKey, setJellyfinApiKey] = useState('');
    const [servers, setServers] = useState<PlexServer[]>([]);
    const [selectedServer, setSelectedServer] = useState('');
    const [checkInterval, setCheckInterval] = useState(60);
    const [hideStreamUsers, setHideStreamUsers] = useState<string>('false');
    const [showUsernamesInAnalytics, setShowUsernamesInAnalytics] = useState(false);
    const [useTrendingSlideshowOnLogin, setUseTrendingSlideshowOnLogin] = useState(false);
    const [publicStatusEnabled, setPublicStatusEnabled] = useState(true);
    const [defaultLibraryIds, setDefaultLibraryIds] = useState<string[]>([]);
    const {
        activeTab,
        setActiveTab,
        highlightMaintenanceToggle,
        settingsSearch,
        setSettingsSearch,
        settingsTabsFlat,
        visibleTabGroups,
    } = useSettingsTabs();
    const { statusConfig, setStatusConfig, users, libraries, setLibraries, fetchStatusConfig } = useSettingsResources({ activeTab, addToast });

    // SMTP States
    const [smtpHost, setSmtpHost] = useState('');
    const [smtpPort, setSmtpPort] = useState(587);
    const [smtpUser, setSmtpUser] = useState('');
    const [smtpPass, setSmtpPass] = useState('');
    const [smtpFrom, setSmtpFrom] = useState('');
    const [smtpSecure, setSmtpSecure] = useState(false);
    const [emailDaysBefore, setEmailDaysBefore] = useState(7);
    const [testRecipient, setTestRecipient] = useState('');

    // Newsletter States
    const [newsletterFrequency, setNewsletterFrequency] = useState('disabled');
    const [newsletterDay, setNewsletterDay] = useState(0);
    const [publicDomain, setPublicDomain] = useState('https://yourdomain.com');
    const [requestUrl, setRequestUrl] = useState('https://yourdomain.com');
    const [contactUrl, setContactUrl] = useState('');
    const [contactWhatsApp, setContactWhatsApp] = useState('');
    const [contactEmail, setContactEmail] = useState('');

    // Cleanup States
    const [inactiveCleanupEnabled, setInactiveCleanupEnabled] = useState(false);
    const [inactiveCleanupDays, setInactiveCleanupDays] = useState(90);

    // Media Stack States
    const [sonarrUrl, setSonarrUrl] = useState('');
    const [sonarrApiKey, setSonarrApiKey] = useState('');
    const [radarrUrl, setRadarrUrl] = useState('');
    const [radarrApiKey, setRadarrApiKey] = useState('');
    const [tautulliUrl, setTautulliUrl] = useState('');
    const [tautulliApiKey, setTautulliApiKey] = useState('');
    const [jellystatUrl, setJellystatUrl] = useState('');
    const [jellystatApiKey, setJellystatApiKey] = useState('');
    const [requestAppType, setRequestAppType] = useState('none');
    const [requestAppUrl, setRequestAppUrl] = useState('');
    const [requestAppApiKey, setRequestAppApiKey] = useState('');
    const [maintenanceExperimentalEnabled, setMaintenanceExperimentalEnabled] = useState(false);
    const [dashboardLayout, setDashboardLayout] = useState<DashboardLayoutConfig>(DEFAULT_DASHBOARD_LAYOUT);
    const dashboardLayoutRef = useRef<DashboardLayoutConfig>(DEFAULT_DASHBOARD_LAYOUT);

    const updateDashboardLayout = useCallback((next: DashboardLayoutConfig) => {
        dashboardLayoutRef.current = next;
        setDashboardLayout(next);
    }, []);

    // Branding & UI States
    const [customLogoUrl, setCustomLogoUrl] = useState('');
    const [backgroundImageUrl, setBackgroundImageUrl] = useState('');
    const [useScrollRevealAnimations, setUseScrollRevealAnimations] = useState(false);
    const [useCinematicLoading, setUseCinematicLoading] = useState(false);
    const [useBrandedSkeleton, setUseBrandedSkeleton] = useState(true);
    const [useTrendingSlideshow, setUseTrendingSlideshow] = useState(false);
    const [trendingSlideshowInterval, setTrendingSlideshowInterval] = useState(30);
    const [tmdbApiKey, setTmdbApiKey] = useState('');
    const [brandingTheme, setBrandingTheme] = useState('plex');
    const [referralEnabled, setReferralEnabled] = useState(false);
    const [referralTrialDays, setReferralTrialDays] = useState(3);
    const [referralRewardDays, setReferralRewardDays] = useState(7);
    const [announcement, setAnnouncement] = useState('');
    const [isPushingAnnouncement, setIsPushingAnnouncement] = useState(false);
    const [use24HourClock, setUse24HourClock] = useState(initialSettings?.use24HourClock || false);
    const [showPosterQualityBadges, setShowPosterQualityBadges] = useState(initialSettings?.showPosterQualityBadges !== false);
    const [allowTemporaryAccess, setAllowTemporaryAccess] = useState(initialSettings?.allowTemporaryAccess || false);
    const [navOrder, setNavOrder] = useState<string[]>(getDefaultSettingsNavOrder);
    const [logoFile, setLogoFile] = useState<File | null>(null);
    const {
        tasks,
        diagnostics,
        isLoadingDiagnostics,
        backupRestoreText,
        setBackupRestoreText,
        isRestoringBackup,
        autoBackupEnabled,
        setAutoBackupEnabled,
        autoBackupIntervalDays,
        setAutoBackupIntervalDays,
        autoBackupRetentionCount,
        setAutoBackupRetentionCount,
        backupFiles,
        isLoadingAuditLog,
        auditLogPage,
        setAuditLogPage,
        deletedUsersLog,
        emailLogPage,
        setEmailLogPage,
        fetchDiagnostics,
        fetchAuditLog,
        handleDownloadBackup,
        handleCreateBackupFile,
        handleRestoreBackup,
        handleRestoreFromFile,
        handleUnblockDeletedUser,
        handleRunTask,
        systemHealth,
        totalAuditLogPages,
        pagedAuditEntries,
        totalEmailLogPages,
        pagedEmailEntries,
    } = useSettingsAdminPanel({
        activeTab,
        addToast,
        setLoading,
        mediaServerType,
        maintenanceExperimentalEnabled,
    });

    const handleFetchServers = usePlexServerDiscovery({
        token,
        plexServerUrl,
        selectedServer,
        addToast,
        setLoading,
        setServers,
        setSelectedServer,
    });

    const {
        isTestingSmtp,
        isTestingNewsletter,
        isSendingNewsletter,
        handleTestEmail,
        handleTestNewsletter,
        handleSendNewsletterNow,
    } = useSettingsEmailActions({
        addToast,
        smtpHost,
        smtpPort,
        smtpUser,
        smtpPass,
        smtpFrom,
        smtpSecure,
        testRecipient,
    });

    const handlePushAnnouncement = async () => {
        setIsPushingAnnouncement(true);
        try {
            const res = await apiFetch('/api/announcements/push', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: announcement, sendEmail: true })
            });
            if (res.error) throw new Error(res.error);
            addToast('Announcement saved and email push started (staggered over 30 mins).');
        } catch (e: any) {
            addToast(e.message || 'Failed to push announcement', 'error');
        } finally {
            setIsPushingAnnouncement(false);
        }
    };

    useEffect(() => {
        if (isConfigLoaded) {
            hydrateSettingsFromConfig(initialSettings, {
                setToken,
                setMediaServerType,
                setPlexServerUrl,
                setJellyfinUrl,
                setJellyfinApiKey,
                setSelectedServer,
                setCheckInterval,
                setSmtpHost,
                setSmtpPort,
                setSmtpUser,
                setSmtpPass,
                setSmtpFrom,
                setSmtpSecure,
                setEmailDaysBefore,
                setNewsletterFrequency,
                setNewsletterDay,
                setInactiveCleanupEnabled,
                setInactiveCleanupDays,
                setPublicDomain,
                setRequestUrl,
                setContactUrl,
                setContactWhatsApp,
                setContactEmail,
                setSonarrUrl,
                setSonarrApiKey,
                setRadarrUrl,
                setRadarrApiKey,
                setTautulliUrl,
                setTautulliApiKey,
                setJellystatUrl,
                setJellystatApiKey,
                setRequestAppType,
                setRequestAppUrl,
                setRequestAppApiKey,
                setBrandingTheme,
                setCustomLogoUrl,
                setBackgroundImageUrl,
                setUseScrollRevealAnimations,
                setUseCinematicLoading,
                setUseBrandedSkeleton,
                setUseTrendingSlideshow,
                setTrendingSlideshowInterval,
                setTmdbApiKey,
                setReferralEnabled,
                setReferralTrialDays,
                setReferralRewardDays,
                setAnnouncement,
                setNavOrder,
                setHideStreamUsers,
                setShowUsernamesInAnalytics,
                setUseTrendingSlideshowOnLogin,
                setPublicStatusEnabled,
                setDefaultLibraryIds,
                setUse24HourClock,
                setShowPosterQualityBadges,
                setAllowTemporaryAccess,
                setAutoBackupEnabled,
                setAutoBackupIntervalDays,
                setAutoBackupRetentionCount,
                setMaintenanceExperimentalEnabled,
                setDashboardLayout,
                setTestRecipient,
                setServers,
                dashboardLayoutRef,
            });
        }
    }, [initialSettings, isConfigLoaded]);

    const handleSave = async () => {
        if (activeTab === 'stream-rules' && streamRulesSaveHandlerRef.current) {
            await streamRulesSaveHandlerRef.current();
            return;
        }
        if (mediaServerType === 'plex' && (!token || !selectedServer)) {
            addToast('Token and server must be selected.', 'error');
            return;
        }
        if (mediaServerType === 'jellyfin' && (!jellyfinUrl || !hasIntegrationCredentials(jellyfinUrl, jellyfinApiKey, initialSettings.jellyfinUrl, initialSettings.jellyfinApiKey))) {
            addToast('Jellyfin URL and API key must be set.', 'error');
            return;
        }

        let nextCustomLogoUrl = customLogoUrl;
        if (logoFile) {
            try {
                await fetch(portalUrl('/api/config/logo'), { method: 'POST', body: logoFile });
                nextCustomLogoUrl = `/static/logo.png?v=${Date.now()}`;
                setCustomLogoUrl(nextCustomLogoUrl);
                setLogoFile(null);
            } catch (e) {
                addToast('Failed to upload logo', 'error');
                return;
            }
        }

        if (statusDraft) {
            try {
                await apiFetch('/api/status/config', { method: 'POST', body: JSON.stringify(statusDraft) });
                setStatusConfig(statusDraft);
            } catch (e: any) {
                addToast('Failed to save status monitor configuration', 'error');
            }
        }

        await handleSaveConfig(buildSettingsSavePayload({
            token,
            mediaServerType,
            selectedServer,
            plexServerUrl,
            jellyfinUrl,
            jellyfinApiKey,
            checkInterval,
            smtpHost,
            smtpPort,
            smtpUser,
            smtpPass,
            smtpFrom,
            smtpSecure,
            emailDaysBefore,
            newsletterFrequency,
            newsletterDay,
            inactiveCleanupEnabled,
            inactiveCleanupDays,
            publicDomain,
            requestUrl,
            contactUrl,
            contactWhatsApp,
            contactEmail,
            sonarrUrl,
            sonarrApiKey,
            radarrUrl,
            radarrApiKey,
            tautulliUrl,
            tautulliApiKey,
            jellystatUrl,
            jellystatApiKey,
            requestAppType,
            requestAppUrl,
            requestAppApiKey,
            customLogoUrl: nextCustomLogoUrl,
            brandingTheme,
            backgroundImageUrl,
            useScrollRevealAnimations,
            useCinematicLoading,
            useBrandedSkeleton,
            useTrendingSlideshow,
            trendingSlideshowInterval,
            tmdbApiKey,
            referralEnabled,
            referralTrialDays,
            referralRewardDays,
            announcement,
            navOrder,
            hideStreamUsers,
            showUsernamesInAnalytics,
            useTrendingSlideshowOnLogin,
            publicStatusEnabled,
            defaultLibraryIds,
            use24HourClock,
            allowTemporaryAccess,
            showPosterQualityBadges,
            autoBackupEnabled,
            autoBackupIntervalDays,
            autoBackupRetentionCount,
            maintenanceExperimentalEnabled,
            dashboardLayout: dashboardLayoutRef.current,
        }));
    };
    const settingsTabPanelProps = buildSettingsTabPanelProps({
        activeTab, addToast, streamRulesSaveHandlerRef, initialSettings,
        mediaServerType, token, plexServerUrl, jellyfinUrl, jellyfinApiKey, servers, selectedServer,
        checkInterval, libraries, defaultLibraryIds, hideStreamUsers, showUsernamesInAnalytics, requestUrl, contactUrl,
        setMediaServerType, setToken, setPlexServerUrl, setJellyfinUrl, setJellyfinApiKey, setSelectedServer,
        setCheckInterval, setDefaultLibraryIds, setHideStreamUsers, setShowUsernamesInAnalytics, setRequestUrl,
        setContactUrl, handleFetchServers,
        smtpHost, smtpPort, smtpUser, smtpPass, smtpFrom, smtpSecure, emailDaysBefore, testRecipient,
        isTestingSmtp, setSmtpHost, setSmtpPort, setSmtpUser, setSmtpPass, setSmtpFrom, setSmtpSecure,
        setEmailDaysBefore, setTestRecipient, handleTestEmail,
        newsletterFrequency, newsletterDay, publicDomain, isTestingNewsletter, isSendingNewsletter,
        setNewsletterFrequency, setNewsletterDay, setPublicDomain, handleTestNewsletter, handleSendNewsletterNow,
        inactiveCleanupEnabled, inactiveCleanupDays, setInactiveCleanupEnabled, setInactiveCleanupDays,
        sonarrUrl, sonarrApiKey, radarrUrl, radarrApiKey, tmdbApiKey, tautulliUrl, tautulliApiKey,
        jellystatUrl, jellystatApiKey, requestAppType, requestAppUrl, requestAppApiKey,
        setSonarrUrl, setSonarrApiKey, setRadarrUrl, setRadarrApiKey, setTmdbApiKey, setTautulliUrl,
        setTautulliApiKey, setJellystatUrl, setJellystatApiKey, setRequestAppType, setRequestAppUrl, setRequestAppApiKey,
        dashboardLayout, updateDashboardLayout, navOrder, setNavOrder, users,
        statusConfig, publicStatusEnabled, setPublicStatusEnabled, setStatusDraft, fetchStatusConfig,
        contactWhatsApp, contactEmail, setContactWhatsApp, setContactEmail,
        customLogoUrl, brandingTheme, backgroundImageUrl, useScrollRevealAnimations, useCinematicLoading,
        useBrandedSkeleton, useTrendingSlideshow, trendingSlideshowInterval, useTrendingSlideshowOnLogin,
        use24HourClock, showPosterQualityBadges, allowTemporaryAccess, announcement, isPushingAnnouncement,
        referralEnabled, referralTrialDays, referralRewardDays, setCustomLogoUrl, setLogoFile, setBrandingTheme,
        setBackgroundImageUrl, setUseScrollRevealAnimations, setUseCinematicLoading, setUseBrandedSkeleton,
        setUseTrendingSlideshow, setTrendingSlideshowInterval, setUseTrendingSlideshowOnLogin, setUse24HourClock,
        setShowPosterQualityBadges, setAllowTemporaryAccess, setAnnouncement, handlePushAnnouncement,
        setReferralEnabled, setReferralTrialDays, setReferralRewardDays,
        tasks, handleRunTask, systemHealth, highlightMaintenanceToggle, maintenanceExperimentalEnabled,
        autoBackupEnabled, autoBackupIntervalDays, autoBackupRetentionCount, backupRestoreText, backupFiles,
        isRestoringBackup, diagnostics, isLoadingDiagnostics, pagedAuditEntries, auditLogPage, totalAuditLogPages,
        isLoadingAuditLog, setMaintenanceExperimentalEnabled, setAutoBackupEnabled, setAutoBackupIntervalDays,
        setAutoBackupRetentionCount, setBackupRestoreText, handleDownloadBackup, handleCreateBackupFile,
        handleRestoreBackup, handleRestoreFromFile, fetchDiagnostics, fetchAuditLog, setAuditLogPage,
        deletedUsersLog, pagedEmailEntries, emailLogPage, totalEmailLogPages, handleUnblockDeletedUser, setEmailLogPage,
    });

    return <SettingsPageLayout
        activeTab={activeTab}
        isLoading={isLoading}
        configLoadError={configLoadError}
        toasts={toasts}
        setToasts={setToasts}
        settingsSearch={settingsSearch}
        settingsTabs={settingsTabsFlat}
        visibleTabGroups={visibleTabGroups}
        panelProps={settingsTabPanelProps}
        onSearchChange={setSettingsSearch}
        onTabChange={setActiveTab}
        onSave={handleSave}
    />;
};
