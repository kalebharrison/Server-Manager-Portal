import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { apiFetch } from '../shared/api';
import { portalUrl } from '../shared/basePath';
import { appConfirm } from '../shared/confirm';
import { Loader, ToastContainer, pushToast, type ToastMessage } from '../shared/toast';
import type { User, PlexServer } from '../shared/types';
import { DEFAULT_DASHBOARD_LAYOUT, normalizeSectionLayout, type DashboardLayoutConfig } from '../shared/dashboardLayout';
import { hasIntegrationCredentials } from './integrationDisplay';
import { SettingsNavigation } from './SettingsNavigation';
import { calculateSystemHealth } from './settingsSystemHealth';
import { getDefaultSettingsNavOrder, ensureMaintenanceNavOrder } from './settingsNavOrder';
import { SettingsTabPanel } from './SettingsTabPanel';
import { useSettingsTabs } from './useSettingsTabs';


export const SettingsDashboard: React.FC = () => {
    const [statusDraft, setStatusDraft] = useState<any>(null);
    const [isLoading, setLoading] = useState(true);
    const [configLoadError, setConfigLoadError] = useState<string | null>(null);
    const [initialSettings, setInitialSettings] = useState<any>({});
    const [isConfigLoaded, setIsConfigLoaded] = useState(false);
    const [toasts, setToasts] = useState<ToastMessage[]>([]);
    const streamRulesSaveHandlerRef = useRef<(() => Promise<boolean>) | null>(null);

    // Admin features moved here
    const [statusConfig, setStatusConfig] = useState<any>({});
    const [users, setUsers] = useState<User[]>([]);

    const addToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
        setToasts(t => pushToast(t, message, type));
    }, []);

    const fetchStatusConfig = useCallback(async () => {
        try {
            const sConf = await apiFetch('/api/status/config');
            setStatusConfig(sConf);
        } catch (e) { }
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
                const usersData = await apiFetch('/api/users');
                setUsers(usersData);
                await fetchStatusConfig();
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
        // Libraries call Plex on the server — can hang in Docker if a loopback URI is used.
        apiFetch('/api/plex/libraries').then((libData) => setLibraries(libData || [])).catch(() => setLibraries([]));
    }, [addToast, fetchStatusConfig]);

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
    const [libraries, setLibraries] = useState<any[]>([]);
    const {
        activeTab,
        setActiveTab,
        highlightMaintenanceToggle,
        settingsSearch,
        setSettingsSearch,
        settingsTabsFlat,
        visibleTabGroups,
    } = useSettingsTabs();

    // SMTP States
    const [smtpHost, setSmtpHost] = useState('');
    const [smtpPort, setSmtpPort] = useState(587);
    const [smtpUser, setSmtpUser] = useState('');
    const [smtpPass, setSmtpPass] = useState('');
    const [smtpFrom, setSmtpFrom] = useState('');
    const [smtpSecure, setSmtpSecure] = useState(false);
    const [emailDaysBefore, setEmailDaysBefore] = useState(7);
    const [testRecipient, setTestRecipient] = useState('');
    const [isTestingSmtp, setIsTestingSmtp] = useState(false);
    const [isTestingNewsletter, setIsTestingNewsletter] = useState(false);
    const [isSendingNewsletter, setIsSendingNewsletter] = useState(false);

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
    const [tasks, setTasks] = useState<any[]>([]);
    const [diagnostics, setDiagnostics] = useState<any>(null);
    const [isLoadingDiagnostics, setIsLoadingDiagnostics] = useState(false);
    const [backupRestoreText, setBackupRestoreText] = useState('');
    const [isRestoringBackup, setIsRestoringBackup] = useState(false);
    const [autoBackupEnabled, setAutoBackupEnabled] = useState(false);
    const [autoBackupIntervalDays, setAutoBackupIntervalDays] = useState(2);
    const [autoBackupRetentionCount, setAutoBackupRetentionCount] = useState(10);
    const [backupFiles, setBackupFiles] = useState<any[]>([]);
    const [auditLogEntries, setAuditLogEntries] = useState<any[]>([]);
    const [isLoadingAuditLog, setIsLoadingAuditLog] = useState(false);
    const [auditLogPage, setAuditLogPage] = useState(1);
    const [deletedUsersLog, setDeletedUsersLog] = useState<any[]>([]);
    const [emailLogPage, setEmailLogPage] = useState(1);

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

    const fetchTasks = async () => {
        try {
            const data = await apiFetch('/api/tasks');
            setTasks(data);
        } catch (e) {
            addToast('Failed to load tasks', 'error');
        }
    };

    const fetchDiagnostics = async () => {
        setIsLoadingDiagnostics(true);
        try {
            const data = await apiFetch('/api/admin/diagnostics');
            setDiagnostics(data);
        } catch (e) {
            addToast('Failed to load diagnostics', 'error');
        } finally {
            setIsLoadingDiagnostics(false);
        }
    };

    const fetchBackupFiles = async () => {
        try {
            const data = await apiFetch('/api/admin/backups');
            setBackupFiles(Array.isArray(data) ? data : []);
        } catch (e) {
            addToast('Failed to load backup files', 'error');
        }
    };

    const fetchAuditLog = async () => {
        setIsLoadingAuditLog(true);
        try {
            const data = await apiFetch('/api/audit-log');
            setAuditLogEntries(Array.isArray(data) ? data : []);
            setAuditLogPage(1);
            setEmailLogPage(1);
        } catch (e) {
            addToast('Failed to load audit log', 'error');
        } finally {
            setIsLoadingAuditLog(false);
        }
    };

    const fetchDeletedUsersLog = async () => {
        try {
            const data = await apiFetch('/api/deleted-users');
            setDeletedUsersLog(Array.isArray(data) ? data : []);
        } catch (e) {
            addToast('Failed to load deleted users log', 'error');
        }
    };

    const handleDownloadBackup = async () => {
        try {
            const response = await fetch(portalUrl('/api/admin/backup'));
            if (!response.ok) throw new Error('Backup download failed');
            const text = await response.text();
            const blob = new Blob([text], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `portal-backup-${Date.now()}.json`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
            addToast('Backup downloaded successfully.');
        } catch (e: any) {
            addToast(e.message || 'Backup download failed', 'error');
        }
    };

    const handleCreateBackupFile = async () => {
        try {
            const res = await apiFetch('/api/admin/backups/create', { method: 'POST' });
            addToast(res?.filename ? `Backup created: ${res.filename}` : 'Backup created successfully.');
            await fetchBackupFiles();
            await fetchDiagnostics();
        } catch (e: any) {
            addToast(e.message || 'Failed to create backup file', 'error');
        }
    };

    const handleRestoreBackup = async () => {
        if (!backupRestoreText.trim()) {
            addToast('Paste a backup JSON payload before restoring.', 'error');
            return;
        }
        appConfirm('Restore backup now? This overwrites current data files.', async () => {
            setIsRestoringBackup(true);
            try {
                const response = await fetch(portalUrl('/api/admin/backup/restore?confirm=true'), {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'text/plain',
                        'x-confirm-restore': 'true'
                    },
                    body: backupRestoreText
                });
                const data = await response.json().catch(() => ({}));
                if (!response.ok) throw new Error(data.error || 'Backup restore failed');
                addToast(data.message || 'Backup restored successfully.');
                await Promise.all([fetchDiagnostics(), fetchTasks()]);
            } catch (e: any) {
                addToast(e.message || 'Backup restore failed', 'error');
            } finally {
                setIsRestoringBackup(false);
            }
        });
    };

    const handleRestoreFromFile = async (filename: string) => {
        appConfirm(`Restore from backup file "${filename}"? This will overwrite current data.`, async () => {
            try {
                const res = await apiFetch('/api/admin/backups/restore-file', {
                    method: 'POST',
                    body: JSON.stringify({ filename, confirm: true })
                });
                addToast(res?.message || 'Backup restored from file successfully.');
                await Promise.all([fetchDiagnostics(), fetchTasks(), fetchBackupFiles()]);
            } catch (e: any) {
                addToast(e.message || 'Failed to restore backup file', 'error');
            }
        });
    };

    useEffect(() => {
        if (activeTab === 'tasks' || activeTab === 'system') {
            fetchTasks();
        }
        if (activeTab === 'system') {
            fetchDiagnostics();
            fetchBackupFiles();
            fetchAuditLog();
        }
        if (activeTab === 'logs') {
            fetchDeletedUsersLog();
            fetchAuditLog();
        }
    }, [activeTab]);

    const handleUnblockDeletedUser = async (deletedUser: any) => {
        const label = deletedUser.username || deletedUser.email || 'this user';
        appConfirm(`Allow ${label} to use the portal again? This does not invite them automatically.`, async () => {
            setLoading(true);
            try {
                await apiFetch(`/api/deleted-users/${encodeURIComponent(deletedUser.blockId)}`, { method: 'DELETE' });
                addToast('Deleted user unblocked.');
                await Promise.all([fetchDeletedUsersLog(), fetchAuditLog()]);
            } catch (error: any) {
                addToast(error instanceof Error ? error.message : 'Failed to unblock user.', 'error');
            } finally {
                setLoading(false);
            }
        });
    };

    const systemHealth = useMemo(() => calculateSystemHealth({
        diagnostics,
        maintenanceExperimentalEnabled,
        mediaServerType,
    }), [diagnostics, maintenanceExperimentalEnabled, mediaServerType]);

    const auditEventsPerPage = 12;
    const totalAuditLogPages = Math.max(1, Math.ceil(auditLogEntries.length / auditEventsPerPage));
    const pagedAuditEntries = auditLogEntries.slice((auditLogPage - 1) * auditEventsPerPage, auditLogPage * auditEventsPerPage);
    const emailAuditEntries = auditLogEntries.filter(entry => entry.event === 'system_email_sent');
    const emailsPerPage = 12;
    const totalEmailLogPages = Math.max(1, Math.ceil(emailAuditEntries.length / emailsPerPage));
    const pagedEmailEntries = emailAuditEntries.slice((emailLogPage - 1) * emailsPerPage, emailLogPage * emailsPerPage);

    const handleRunTask = async (taskId: string) => {
        setLoading(true);
        try {
            const res = await apiFetch(`/api/tasks/run/${taskId}`, { method: 'POST' });
            addToast(res.message || 'Task executed successfully', 'success');
            await fetchTasks();
        } catch (e) {
            addToast(e instanceof Error ? e.message : 'Task failed', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (isConfigLoaded) {
            setToken(initialSettings.token || '');
            setMediaServerType(initialSettings.mediaServerType === 'jellyfin' ? 'jellyfin' : 'plex');
            setPlexServerUrl(initialSettings.plexServerUrl || '');
            setJellyfinUrl(initialSettings.jellyfinUrl || '');
            setJellyfinApiKey(initialSettings.jellyfinApiKey || '');
            setSelectedServer(initialSettings.serverIdentifier || '');
            setCheckInterval(initialSettings.checkIntervalMinutes || 60);
            setSmtpHost(initialSettings.smtpHost || '');
            setSmtpPort(initialSettings.smtpPort || 587);
            setSmtpUser(initialSettings.smtpUser || '');
            setSmtpPass(initialSettings.smtpPass || '');
            setSmtpFrom(initialSettings.smtpFrom || '');
            setSmtpSecure(!!initialSettings.smtpSecure);
            setEmailDaysBefore(initialSettings.emailDaysBefore || 7);
            setNewsletterFrequency(initialSettings.newsletterFrequency || 'disabled');
            setNewsletterDay(initialSettings.newsletterDay || 0);
            setInactiveCleanupEnabled(!!initialSettings.inactiveCleanupEnabled);
            setInactiveCleanupDays(initialSettings.inactiveCleanupDays || 90);
            setPublicDomain(initialSettings.publicDomain || 'https://portal.yourdomain.com');
            setRequestUrl(initialSettings.requestUrl || 'https://yourdomain.com');
            setContactUrl(initialSettings.contactUrl || '');
            setContactWhatsApp(initialSettings.contactWhatsApp || '');
            setContactEmail(initialSettings.contactEmail || '');
            setSonarrUrl(initialSettings.sonarrUrl || '');
            setSonarrApiKey(initialSettings.sonarrApiKey || '');
            setRadarrUrl(initialSettings.radarrUrl || '');
            setRadarrApiKey(initialSettings.radarrApiKey || '');
            setTautulliUrl(initialSettings.tautulliUrl || '');
            setTautulliApiKey(initialSettings.tautulliApiKey || '');
            setJellystatUrl(initialSettings.jellystatUrl || '');
            setJellystatApiKey(initialSettings.jellystatApiKey || '');
            setRequestAppType(initialSettings.requestAppType === 'overseerr' ? 'seerr' : (initialSettings.requestAppType || 'none'));
            setRequestAppUrl(initialSettings.requestAppUrl || '');
            setRequestAppApiKey(initialSettings.requestAppApiKey || '');
            const savedBrandingTheme = localStorage.getItem('portal-theme') || initialSettings.brandingTheme || 'plex';
            setBrandingTheme(savedBrandingTheme);
            setCustomLogoUrl(initialSettings.customLogoUrl || '');
            setBackgroundImageUrl(initialSettings.backgroundImageUrl || '');
            setUseScrollRevealAnimations(!!initialSettings.useScrollRevealAnimations);
            setUseCinematicLoading(!!initialSettings.useCinematicLoading);
            setUseBrandedSkeleton(initialSettings.useBrandedSkeleton !== false);
            setUseTrendingSlideshow(!!initialSettings.useTrendingSlideshow);
            setTrendingSlideshowInterval(initialSettings.trendingSlideshowInterval || 30);
            setTmdbApiKey(initialSettings.tmdbApiKey || '');
            setReferralEnabled(!!initialSettings.referralEnabled);
            setReferralTrialDays(initialSettings.referralTrialDays || 3);
            setReferralRewardDays(initialSettings.referralRewardDays || 7);
            setAnnouncement(initialSettings.announcement || '');
            if (initialSettings.navOrder) setNavOrder(ensureMaintenanceNavOrder(initialSettings.navOrder));
            setHideStreamUsers(initialSettings.hideStreamUsers === true ? 'anonymous' : (initialSettings.hideStreamUsers || 'false'));
            setShowUsernamesInAnalytics(!!initialSettings.showUsernamesInAnalytics);
            setUseTrendingSlideshowOnLogin(initialSettings.useTrendingSlideshowOnLogin !== false);
            setPublicStatusEnabled(initialSettings.publicStatusEnabled !== false);
            if (initialSettings.defaultLibraryIds) setDefaultLibraryIds(initialSettings.defaultLibraryIds);
            if (initialSettings.use24HourClock !== undefined) setUse24HourClock(!!initialSettings.use24HourClock);
            if (initialSettings.showPosterQualityBadges !== undefined) setShowPosterQualityBadges(initialSettings.showPosterQualityBadges !== false);
            if (initialSettings.allowTemporaryAccess !== undefined) setAllowTemporaryAccess(!!initialSettings.allowTemporaryAccess);
            if (initialSettings.autoBackupEnabled !== undefined) setAutoBackupEnabled(!!initialSettings.autoBackupEnabled);
            if (initialSettings.autoBackupIntervalDays !== undefined) setAutoBackupIntervalDays(Number(initialSettings.autoBackupIntervalDays) || 2);
            if (initialSettings.autoBackupRetentionCount !== undefined) setAutoBackupRetentionCount(Number(initialSettings.autoBackupRetentionCount) || 10);
            if (initialSettings.maintenanceExperimentalEnabled !== undefined) setMaintenanceExperimentalEnabled(!!initialSettings.maintenanceExperimentalEnabled);
            const layout = normalizeSectionLayout(initialSettings.dashboardLayout);
            dashboardLayoutRef.current = layout;
            setDashboardLayout(layout);
            setTestRecipient('');
            setServers([]);
        }
    }, [initialSettings, isConfigLoaded]);

    const handleFetchServers = async () => {
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
    };

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

        if (logoFile) {
            try {
                await fetch(portalUrl('/api/config/logo'), { method: 'POST', body: logoFile });
            } catch (e) {
                addToast('Failed to upload logo', 'error');
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

        await handleSaveConfig({
            token,
            mediaServerType,
            serverIdentifier: selectedServer,
            plexServerUrl: plexServerUrl || '',
            jellyfinUrl,
            jellyfinApiKey,
            checkIntervalMinutes: checkInterval,
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
            primaryColor: '',
            customLogoUrl,
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
            navOrder: ensureMaintenanceNavOrder(navOrder),
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
            dashboardLayout: normalizeSectionLayout(dashboardLayoutRef.current)
        });
    };
    const handleTestEmail = async () => {
        if (!smtpHost || !smtpUser || !smtpPass || !testRecipient) {
            addToast('Please fill out SMTP Host, User, Password, and Test Recipient.', 'error');
            return;
        }
        setIsTestingSmtp(true);
        try {
            const result = await apiFetch('/api/config/test-email', {
                method: 'POST',
                body: JSON.stringify({
                    smtpHost,
                    smtpPort,
                    smtpUser,
                    smtpPass,
                    smtpFrom,
                    smtpSecure,
                    testRecipient
                })
            });
            addToast(result.message || 'Test email sent successfully!', 'success');
        } catch (error) {
            addToast(error instanceof Error ? error.message : 'SMTP test failed.', 'error');
        } finally {
            setIsTestingSmtp(false);
        }
    };

    const handleTestNewsletter = async () => {
        setIsTestingNewsletter(true);
        try {
            const result = await apiFetch('/api/newsletter/test', {
                method: 'POST'
            });
            addToast(result.message || 'Newsletter sent successfully!', 'success');
        } catch (error) {
            addToast(error instanceof Error ? error.message : 'Newsletter test failed.', 'error');
        } finally {
            setIsTestingNewsletter(false);
        }
    };

    const handleSendNewsletterNow = async () => {
        appConfirm('Are you sure you want to send the newsletter to ALL configured users immediately? This cannot be undone.', async () => {
            setIsSendingNewsletter(true);
            try {
                const result = await apiFetch('/api/newsletter/send-now', {
                    method: 'POST'
                });
                addToast(result.message || 'Newsletter dispatch initiated!', 'success');
            } catch (error) {
                addToast(error instanceof Error ? error.message : 'Newsletter dispatch failed.', 'error');
            } finally {
                setIsSendingNewsletter(false);
            }
        });
    };

    const settingsTabPanelProps = {
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
    };

    return (
        <div className="w-full flex flex-col box-border">
            <Loader isLoading={isLoading} />
            <ToastContainer toasts={toasts} setToasts={setToasts} />


            <header className="flex items-center justify-between w-full mb-6 mt-2 md:mt-0">
                <h1 className="text-xl md:text-3xl font-bold text-plex">Settings</h1>
            </header>

            {configLoadError && (
                <div className="mb-6 p-4 rounded-xl border border-red-500/40 bg-red-500/10 text-red-200 text-sm">
                    Could not load settings: {configLoadError}. Try refreshing the page. If this persists on Docker, confirm your session cookie is valid and the container can reach the API.
                </div>
            )}

            <div className="w-full flex flex-col min-w-0">
                <div className="w-full md:grid md:grid-cols-[18rem_minmax(0,1fr)] md:gap-8 xl:gap-10">
                    <SettingsNavigation
                        activeTab={activeTab}
                        settingsSearch={settingsSearch}
                        settingsTabs={settingsTabsFlat}
                        visibleTabGroups={visibleTabGroups}
                        onSearchChange={setSettingsSearch}
                        onTabChange={setActiveTab}
                    />

                    <div className="overflow-y-auto flex-grow mb-4 custom-scrollbar md:pr-1 min-w-0 w-full">
                        <div className="settings-panel">
                            <SettingsTabPanel {...settingsTabPanelProps} />
                        </div>
                    </div>
                </div>
                <div className="flex justify-end gap-4 mt-8 pb-1">
                    <button className="w-full sm:w-auto px-6 py-3 bg-plex text-background rounded-lg font-bold hover:bg-plex-hover transition-colors flex items-center justify-center gap-2 shadow-lg shadow-plex/10" onClick={handleSave}>{activeTab === 'stream-rules' ? 'Save Stream Rules' : 'Save Settings'}</button>
                </div>
            </div>
        </div>
    );
};
