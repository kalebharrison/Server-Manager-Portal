import React from 'react';

import { appConfirm } from '../shared/confirm';
import { BackgroundTasksTab } from './BackgroundTasksTab';
import { BrandingSettingsTab } from './BrandingSettingsTab';
import { BroadcastTab } from './BroadcastTab';
import { CleanupSettingsTab } from './CleanupSettingsTab';
import { ContactSettingsTab } from './ContactSettingsTab';
import { HomeLayoutSettings } from './HomeLayoutSettings';
import { InvitesSettings } from './InvitesSettings';
import { LogsAuditTab } from './LogsAuditTab';
import { MediaServerSettingsTab } from './MediaServerSettingsTab';
import { MediaStackSettingsTab } from './MediaStackSettingsTab';
import { NavigationOrderTab } from './NavigationOrderTab';
import { NewsletterSettingsTab } from './NewsletterSettingsTab';
import { SmtpSettingsTab } from './SmtpSettingsTab';
import { StatusSettingsTab } from './StatusSettingsTab';
import { StreamKillRulesPanel } from './StreamKillRulesPanel';
import { SystemSettingsTab } from './SystemSettingsTab';

export const SettingsTabPanel: React.FC<any> = ({
    activeTab,
    addToast,
    streamRulesSaveHandlerRef,
    initialSettings,
    mediaServerType,
    token,
    plexServerUrl,
    jellyfinUrl,
    jellyfinApiKey,
    servers,
    selectedServer,
    checkInterval,
    libraries,
    defaultLibraryIds,
    hideStreamUsers,
    showUsernamesInAnalytics,
    requestUrl,
    contactUrl,
    setMediaServerType,
    setToken,
    setPlexServerUrl,
    setJellyfinUrl,
    setJellyfinApiKey,
    setSelectedServer,
    setCheckInterval,
    setDefaultLibraryIds,
    setHideStreamUsers,
    setShowUsernamesInAnalytics,
    setRequestUrl,
    setContactUrl,
    handleFetchServers,
    smtpHost,
    smtpPort,
    smtpUser,
    smtpPass,
    smtpFrom,
    smtpSecure,
    emailDaysBefore,
    testRecipient,
    isTestingSmtp,
    setSmtpHost,
    setSmtpPort,
    setSmtpUser,
    setSmtpPass,
    setSmtpFrom,
    setSmtpSecure,
    setEmailDaysBefore,
    setTestRecipient,
    handleTestEmail,
    newsletterFrequency,
    newsletterDay,
    publicDomain,
    isTestingNewsletter,
    isSendingNewsletter,
    setNewsletterFrequency,
    setNewsletterDay,
    setPublicDomain,
    handleTestNewsletter,
    handleSendNewsletterNow,
    inactiveCleanupEnabled,
    inactiveCleanupDays,
    setInactiveCleanupEnabled,
    setInactiveCleanupDays,
    sonarrUrl,
    sonarrApiKey,
    radarrUrl,
    radarrApiKey,
    tmdbApiKey,
    tautulliUrl,
    tautulliApiKey,
    jellystatUrl,
    jellystatApiKey,
    requestAppType,
    requestAppUrl,
    requestAppApiKey,
    setSonarrUrl,
    setSonarrApiKey,
    setRadarrUrl,
    setRadarrApiKey,
    setTmdbApiKey,
    setTautulliUrl,
    setTautulliApiKey,
    setJellystatUrl,
    setJellystatApiKey,
    setRequestAppType,
    setRequestAppUrl,
    setRequestAppApiKey,
    dashboardLayout,
    updateDashboardLayout,
    navOrder,
    setNavOrder,
    users,
    statusConfig,
    publicStatusEnabled,
    setPublicStatusEnabled,
    setStatusDraft,
    fetchStatusConfig,
    contactWhatsApp,
    contactEmail,
    setContactWhatsApp,
    setContactEmail,
    customLogoUrl,
    brandingTheme,
    backgroundImageUrl,
    useScrollRevealAnimations,
    useCinematicLoading,
    useBrandedSkeleton,
    useTrendingSlideshow,
    trendingSlideshowInterval,
    useTrendingSlideshowOnLogin,
    use24HourClock,
    showPosterQualityBadges,
    allowTemporaryAccess,
    announcement,
    isPushingAnnouncement,
    referralEnabled,
    referralTrialDays,
    referralRewardDays,
    setCustomLogoUrl,
    setLogoFile,
    setBrandingTheme,
    setBackgroundImageUrl,
    setUseScrollRevealAnimations,
    setUseCinematicLoading,
    setUseBrandedSkeleton,
    setUseTrendingSlideshow,
    setTrendingSlideshowInterval,
    setUseTrendingSlideshowOnLogin,
    setUse24HourClock,
    setShowPosterQualityBadges,
    setAllowTemporaryAccess,
    setAnnouncement,
    handlePushAnnouncement,
    setReferralEnabled,
    setReferralTrialDays,
    setReferralRewardDays,
    tasks,
    handleRunTask,
    systemHealth,
    highlightMaintenanceToggle,
    maintenanceExperimentalEnabled,
    autoBackupEnabled,
    autoBackupIntervalDays,
    autoBackupRetentionCount,
    backupRestoreText,
    backupFiles,
    isRestoringBackup,
    diagnostics,
    isLoadingDiagnostics,
    pagedAuditEntries,
    auditLogPage,
    totalAuditLogPages,
    isLoadingAuditLog,
    setMaintenanceExperimentalEnabled,
    setAutoBackupEnabled,
    setAutoBackupIntervalDays,
    setAutoBackupRetentionCount,
    setBackupRestoreText,
    handleDownloadBackup,
    handleCreateBackupFile,
    handleRestoreBackup,
    handleRestoreFromFile,
    fetchDiagnostics,
    fetchAuditLog,
    setAuditLogPage,
    deletedUsersLog,
    pagedEmailEntries,
    emailLogPage,
    totalEmailLogPages,
    handleUnblockDeletedUser,
    setEmailLogPage,
}) => (
    <>
        {activeTab === 'stream-rules' && <StreamKillRulesPanel addToast={addToast} registerSaveHandler={(handler) => { streamRulesSaveHandlerRef.current = handler; }} />}

        {activeTab === 'plex' && (
            <MediaServerSettingsTab
                initialSettings={initialSettings}
                mediaServerType={mediaServerType}
                token={token}
                plexServerUrl={plexServerUrl}
                jellyfinUrl={jellyfinUrl}
                jellyfinApiKey={jellyfinApiKey}
                servers={servers}
                selectedServer={selectedServer}
                checkInterval={checkInterval}
                libraries={libraries}
                defaultLibraryIds={defaultLibraryIds}
                hideStreamUsers={hideStreamUsers}
                showUsernamesInAnalytics={showUsernamesInAnalytics}
                requestUrl={requestUrl}
                contactUrl={contactUrl}
                onMediaServerTypeChange={setMediaServerType}
                onTokenChange={setToken}
                onPlexServerUrlChange={setPlexServerUrl}
                onJellyfinUrlChange={setJellyfinUrl}
                onJellyfinApiKeyChange={setJellyfinApiKey}
                onSelectedServerChange={setSelectedServer}
                onCheckIntervalChange={setCheckInterval}
                onDefaultLibraryIdsChange={setDefaultLibraryIds}
                onHideStreamUsersChange={setHideStreamUsers}
                onShowUsernamesInAnalyticsChange={setShowUsernamesInAnalytics}
                onRequestUrlChange={setRequestUrl}
                onContactUrlChange={setContactUrl}
                onFetchServers={handleFetchServers}
                addToast={addToast}
            />
        )}

        {activeTab === 'smtp' && (
            <SmtpSettingsTab
                smtpHost={smtpHost}
                smtpPort={smtpPort}
                smtpUser={smtpUser}
                smtpPass={smtpPass}
                smtpFrom={smtpFrom}
                smtpSecure={smtpSecure}
                emailDaysBefore={emailDaysBefore}
                testRecipient={testRecipient}
                isTestingSmtp={isTestingSmtp}
                onSmtpHostChange={setSmtpHost}
                onSmtpPortChange={setSmtpPort}
                onSmtpUserChange={setSmtpUser}
                onSmtpPassChange={setSmtpPass}
                onSmtpFromChange={setSmtpFrom}
                onSmtpSecureChange={setSmtpSecure}
                onEmailDaysBeforeChange={setEmailDaysBefore}
                onTestRecipientChange={setTestRecipient}
                onTestEmail={handleTestEmail}
            />
        )}

        {activeTab === 'newsletter' && (
            <NewsletterSettingsTab
                newsletterFrequency={newsletterFrequency}
                newsletterDay={newsletterDay}
                publicDomain={publicDomain}
                isTestingNewsletter={isTestingNewsletter}
                isSendingNewsletter={isSendingNewsletter}
                onNewsletterFrequencyChange={setNewsletterFrequency}
                onNewsletterDayChange={setNewsletterDay}
                onPublicDomainChange={setPublicDomain}
                onTestNewsletter={handleTestNewsletter}
                onSendNewsletterNow={handleSendNewsletterNow}
            />
        )}

        {activeTab === 'cleanup' && (
            <CleanupSettingsTab
                inactiveCleanupEnabled={inactiveCleanupEnabled}
                inactiveCleanupDays={inactiveCleanupDays}
                onInactiveCleanupEnabledChange={setInactiveCleanupEnabled}
                onInactiveCleanupDaysChange={setInactiveCleanupDays}
            />
        )}

        {activeTab === 'mediastack' && (
            <MediaStackSettingsTab
                initialSettings={initialSettings}
                sonarrUrl={sonarrUrl}
                sonarrApiKey={sonarrApiKey}
                radarrUrl={radarrUrl}
                radarrApiKey={radarrApiKey}
                tmdbApiKey={tmdbApiKey}
                tautulliUrl={tautulliUrl}
                tautulliApiKey={tautulliApiKey}
                jellystatUrl={jellystatUrl}
                jellystatApiKey={jellystatApiKey}
                requestAppType={requestAppType}
                requestAppUrl={requestAppUrl}
                requestAppApiKey={requestAppApiKey}
                onSonarrUrlChange={setSonarrUrl}
                onSonarrApiKeyChange={setSonarrApiKey}
                onRadarrUrlChange={setRadarrUrl}
                onRadarrApiKeyChange={setRadarrApiKey}
                onTmdbApiKeyChange={setTmdbApiKey}
                onTautulliUrlChange={setTautulliUrl}
                onTautulliApiKeyChange={setTautulliApiKey}
                onJellystatUrlChange={setJellystatUrl}
                onJellystatApiKeyChange={setJellystatApiKey}
                onRequestAppTypeChange={setRequestAppType}
                onRequestAppUrlChange={setRequestAppUrl}
                onRequestAppApiKeyChange={setRequestAppApiKey}
                addToast={addToast}
            />
        )}

        {activeTab === 'home-layout' && (
            <HomeLayoutSettings layout={dashboardLayout} onChange={updateDashboardLayout} />
        )}

        {activeTab === 'navigation' && <NavigationOrderTab navOrder={navOrder} onNavOrderChange={setNavOrder} />}

        {activeTab === 'broadcast' && <BroadcastTab users={users} />}

        {activeTab === 'status' && (
            <StatusSettingsTab
                statusConfig={statusConfig}
                publicStatusEnabled={publicStatusEnabled}
                onPublicStatusEnabledChange={setPublicStatusEnabled}
                onStatusDraftChange={setStatusDraft}
                appConfirm={appConfirm}
                fetchStatusConfig={fetchStatusConfig}
                addToast={addToast}
            />
        )}

        {activeTab === 'contact' && (
            <ContactSettingsTab
                contactWhatsApp={contactWhatsApp}
                contactEmail={contactEmail}
                onContactWhatsAppChange={setContactWhatsApp}
                onContactEmailChange={setContactEmail}
            />
        )}

        {activeTab === 'branding' && (
            <BrandingSettingsTab
                mediaServerType={mediaServerType}
                customLogoUrl={customLogoUrl}
                brandingTheme={brandingTheme}
                backgroundImageUrl={backgroundImageUrl}
                useScrollRevealAnimations={useScrollRevealAnimations}
                useCinematicLoading={useCinematicLoading}
                useBrandedSkeleton={useBrandedSkeleton}
                useTrendingSlideshow={useTrendingSlideshow}
                trendingSlideshowInterval={trendingSlideshowInterval}
                useTrendingSlideshowOnLogin={useTrendingSlideshowOnLogin}
                use24HourClock={use24HourClock}
                showPosterQualityBadges={showPosterQualityBadges}
                allowTemporaryAccess={allowTemporaryAccess}
                announcement={announcement}
                isPushingAnnouncement={isPushingAnnouncement}
                referralEnabled={referralEnabled}
                referralTrialDays={referralTrialDays}
                referralRewardDays={referralRewardDays}
                onCustomLogoUrlChange={setCustomLogoUrl}
                onLogoFileChange={setLogoFile}
                onBrandingThemeChange={setBrandingTheme}
                onBackgroundImageUrlChange={setBackgroundImageUrl}
                onUseScrollRevealAnimationsChange={setUseScrollRevealAnimations}
                onUseCinematicLoadingChange={setUseCinematicLoading}
                onUseBrandedSkeletonChange={setUseBrandedSkeleton}
                onUseTrendingSlideshowChange={setUseTrendingSlideshow}
                onTrendingSlideshowIntervalChange={setTrendingSlideshowInterval}
                onUseTrendingSlideshowOnLoginChange={setUseTrendingSlideshowOnLogin}
                onUse24HourClockChange={setUse24HourClock}
                onShowPosterQualityBadgesChange={setShowPosterQualityBadges}
                onAllowTemporaryAccessChange={setAllowTemporaryAccess}
                onAnnouncementChange={setAnnouncement}
                onPushAnnouncement={handlePushAnnouncement}
                onReferralEnabledChange={setReferralEnabled}
                onReferralTrialDaysChange={setReferralTrialDays}
                onReferralRewardDaysChange={setReferralRewardDays}
                addToast={addToast}
            />
        )}

        {activeTab === 'invites' && <InvitesSettings addToast={addToast} />}

        {activeTab === 'tasks' && <BackgroundTasksTab tasks={tasks} onRunTask={handleRunTask} />}

        {activeTab === 'system' && (
            <SystemSettingsTab
                systemHealth={systemHealth}
                highlightMaintenanceToggle={highlightMaintenanceToggle}
                maintenanceExperimentalEnabled={maintenanceExperimentalEnabled}
                autoBackupEnabled={autoBackupEnabled}
                autoBackupIntervalDays={autoBackupIntervalDays}
                autoBackupRetentionCount={autoBackupRetentionCount}
                backupRestoreText={backupRestoreText}
                backupFiles={backupFiles}
                isRestoringBackup={isRestoringBackup}
                diagnostics={diagnostics}
                mediaServerType={mediaServerType}
                isLoadingDiagnostics={isLoadingDiagnostics}
                tasks={tasks}
                pagedAuditEntries={pagedAuditEntries}
                auditLogPage={auditLogPage}
                totalAuditLogPages={totalAuditLogPages}
                isLoadingAuditLog={isLoadingAuditLog}
                onMaintenanceExperimentalEnabledChange={setMaintenanceExperimentalEnabled}
                onAutoBackupEnabledChange={setAutoBackupEnabled}
                onAutoBackupIntervalDaysChange={setAutoBackupIntervalDays}
                onAutoBackupRetentionCountChange={setAutoBackupRetentionCount}
                onBackupRestoreTextChange={setBackupRestoreText}
                onDownloadBackup={handleDownloadBackup}
                onCreateBackupFile={handleCreateBackupFile}
                onRestoreBackup={handleRestoreBackup}
                onRestoreFromFile={handleRestoreFromFile}
                onRefreshDiagnostics={fetchDiagnostics}
                onRefreshAuditLog={fetchAuditLog}
                onAuditLogPageChange={setAuditLogPage}
            />
        )}

        {activeTab === 'logs' && (
            <LogsAuditTab
                deletedUsersLog={deletedUsersLog}
                pagedEmailEntries={pagedEmailEntries}
                emailLogPage={emailLogPage}
                totalEmailLogPages={totalEmailLogPages}
                isLoadingAuditLog={isLoadingAuditLog}
                onRefreshAuditLog={fetchAuditLog}
                onUnblockDeletedUser={handleUnblockDeletedUser}
                onEmailLogPageChange={setEmailLogPage}
            />
        )}
    </>
);
