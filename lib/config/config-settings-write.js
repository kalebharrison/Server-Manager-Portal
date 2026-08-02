import { normalizeArrConfig, sanitizeArrInstances } from '../media-stack/arr-instances.js';
import { normalizeCacheRefreshMinutes } from '../cache/cache-refresh.js';
import { buildBrandingFields } from './config-settings-branding-fields.js';
import {
    createResolveConfigIntegrationUrl,
    createResolveSecret,
    resolveSafeIntegrationUrls,
} from './config-settings-resolvers.js';
import { buildDiscordConfigFields } from '../discord/discord-config.js';
import { buildPublicContactUrlFields } from './config-settings-url-fields.js';
import {
    getDefaultScannerConfig,
    resolveScannerSecrets,
    sanitizeScannerTargetUrls,
} from '../scanner/index.js';

/** Keys left behind by retired external integrations. */
export const RETIRED_REQUEST_APP_KEYS = [
    'requestAppType',
    'requestAppUrl',
    'requestAppApiKey',
    'requestAppFetchUrl',
    'requestAppMembershipSync',
    'ombiUrl',
    'ombiApiKey',
    'contactWhatsApp',
];

export const buildConfigFromPostBody = async ({
    body,
    existingConfig,
    secretMask,
    normalizePlexToken,
    sanitizeIntegrationUrl,
    normalizeSectionLayout,
}) => {
    const {
        token, mediaServerType, serverIdentifier, checkIntervalMinutes,
        smtpHost, smtpPort, smtpUser, smtpPass, smtpFrom, smtpSecure, emailDaysBefore,
        newsletterFrequency, newsletterDay, publicDomain, requestUrl, contactUrl, contactEmail,
        sonarrApiKey, radarrApiKey, lidarrApiKey, arrInstances, tautulliApiKey, jellystatApiKey,
        jellyfinApiKey,
        inactiveCleanupEnabled, inactiveCleanupDays,
        primaryColor, customLogoUrl, brandingTheme, backgroundImageUrl, useScrollRevealAnimations, useCinematicLoading, useBrandedSkeleton, useTrendingSlideshow, trendingSlideshowInterval, tmdbApiKey, tvdbApiKey, tvdbPin, cacheRefreshMinutes, referralEnabled, referralTrialDays, referralRewardDays, announcement, navOrder, navHiddenKeys, hideStreamUsers, defaultLibraryIds, use24HourClock, allowTemporaryAccess, showPosterQualityBadges,
        publicStatusEnabled, showLoginServerStats, autoBackupEnabled, autoBackupIntervalDays, autoBackupRetentionCount, dashboardLayout,
        useTrendingSlideshowOnLogin,
        scannerEnabled, scannerHomeWidgetEnabled, scannerWebhooksVisible, scannerManualPathVisible, scanner,
        upgraderEnabled, upgraderAutomationEnabled, upgraderProfileMap, upgraderDefaultPreset,
        upgraderMinSizeGB, upgraderMaxActionsPerHour, upgraderMinScoreDelta,
        upgraderPreferences, upgraderPreferenceWeights,
        upgraderDefaultSort, upgraderDrawerPosition,
        upgraderHuntMissingEpisodes, upgraderHuntAvailableMovies,
        qcCleanupAutomationEnabled, qcMetaDlMinutes, qcStalledHours, qcCompletedNotImportingMinutes,
        qcResearchThrottleHours, qcSnoozeDefaultHours, qcDiscordDigestEnabled, qcPreferImportDiscordOnly,
        qcQbitUrl, qcQbitUsername, qcQbitPassword, qcSabUrl, qcSabApiKey, qcBlockedExtensions,
    } = body;

    const normalizedMediaServerType = ['plex', 'jellyfin'].includes(String(mediaServerType || '').toLowerCase())
        ? String(mediaServerType || '').toLowerCase()
        : (existingConfig.mediaServerType || 'plex');
    const normalizedToken = normalizePlexToken(token);
    const normalizedServerIdentifier = String(serverIdentifier).trim();
    const interval = parseInt(checkIntervalMinutes, 10);

    const resolveConfigIntegrationUrl = createResolveConfigIntegrationUrl(sanitizeIntegrationUrl);
    const resolveSecret = createResolveSecret(secretMask);

    const {
        safeSonarrUrl,
        safeRadarrUrl,
        safeLidarrUrl,
        safeTautulliUrl,
        safeJellystatUrl,
        safeJellyfinUrl,
        safePlexServerUrl,
    } = await resolveSafeIntegrationUrls({ body, existingConfig, resolveConfigIntegrationUrl });

    let safeArrInstances;
    try {
        safeArrInstances = await sanitizeArrInstances(arrInstances, existingConfig, {
            resolveSecret,
            resolveUrl: resolveConfigIntegrationUrl,
        });
    } catch (e) {
        throw new Error(`Invalid automation instance: ${e.message}`);
    }

    const publicContactFields = buildPublicContactUrlFields({
        publicDomain,
        requestUrl,
        contactUrl,
        contactEmail,
        existingConfig,
    });
    const discordFields = buildDiscordConfigFields({
        body,
        existingConfig,
        resolveSecret,
    });
    const brandingFields = buildBrandingFields({
        primaryColor,
        customLogoUrl,
        brandingTheme,
        backgroundImageUrl,
        useScrollRevealAnimations,
        useCinematicLoading,
        useBrandedSkeleton,
        useTrendingSlideshow,
        trendingSlideshowInterval,
        useTrendingSlideshowOnLogin,
        existingConfig,
    });
    let nextScannerConfig = resolveScannerSecrets(
        scanner !== undefined ? scanner : existingConfig.scanner,
        existingConfig.scanner || getDefaultScannerConfig(),
        secretMask,
    );
    try {
        nextScannerConfig = await sanitizeScannerTargetUrls(
            nextScannerConfig,
            resolveConfigIntegrationUrl,
            existingConfig.scanner || getDefaultScannerConfig(),
        );
    } catch (error) {
        throw new Error(`Invalid scanner target URL: ${error.message}`);
    }

    const config = normalizeArrConfig({
        ...existingConfig,
        mediaServerType: normalizedMediaServerType,
        plexToken: normalizedMediaServerType === 'jellyfin' ? resolveSecret(token, existingConfig.plexToken) : resolveSecret(normalizedToken, existingConfig.plexToken),
        serverIdentifier: normalizedMediaServerType === 'jellyfin' ? (normalizedServerIdentifier || existingConfig.serverIdentifier || '') : normalizedServerIdentifier,
        plexServerUrl: safePlexServerUrl || '',
        jellyfinUrl: safeJellyfinUrl,
        jellyfinApiKey: resolveSecret(jellyfinApiKey, existingConfig.jellyfinApiKey),
        checkIntervalMinutes: (interval > 0 ? interval : 60),
        smtpHost: smtpHost || '',
        smtpPort: parseInt(smtpPort, 10) || 587,
        smtpUser: resolveSecret(smtpUser, existingConfig.smtpUser),
        smtpPass: resolveSecret(smtpPass, existingConfig.smtpPass),
        smtpFrom: smtpFrom || '',
        smtpSecure: !!smtpSecure,
        emailDaysBefore: parseInt(emailDaysBefore, 10) || 7,
        newsletterFrequency: newsletterFrequency || 'disabled',
        newsletterDay: parseInt(newsletterDay, 10) || 0,
        inactiveCleanupEnabled: !!inactiveCleanupEnabled,
        inactiveCleanupDays: parseInt(inactiveCleanupDays, 10) || 90,
        ...publicContactFields,
        ...discordFields,
        sonarrUrl: safeSonarrUrl,
        sonarrApiKey: resolveSecret(sonarrApiKey, existingConfig.sonarrApiKey),
        radarrUrl: safeRadarrUrl,
        radarrApiKey: resolveSecret(radarrApiKey, existingConfig.radarrApiKey),
        lidarrUrl: safeLidarrUrl,
        lidarrApiKey: resolveSecret(lidarrApiKey, existingConfig.lidarrApiKey),
        arrInstances: safeArrInstances,
        tautulliUrl: safeTautulliUrl,
        tautulliApiKey: resolveSecret(tautulliApiKey, existingConfig.tautulliApiKey),
        jellystatUrl: safeJellystatUrl,
        jellystatApiKey: resolveSecret(jellystatApiKey, existingConfig.jellystatApiKey),
        ...brandingFields,
        tmdbApiKey: resolveSecret(tmdbApiKey, existingConfig.tmdbApiKey),
        tvdbApiKey: resolveSecret(tvdbApiKey, existingConfig.tvdbApiKey),
        tvdbPin: resolveSecret(tvdbPin, existingConfig.tvdbPin),
        cacheRefreshMinutes: normalizeCacheRefreshMinutes(cacheRefreshMinutes ?? existingConfig.cacheRefreshMinutes),
        referralEnabled: !!referralEnabled,
        referralTrialDays: parseInt(referralTrialDays, 10) || 3,
        referralRewardDays: parseInt(referralRewardDays, 10) || 7,
        announcement: String(announcement || '')
            .replace(/<\s*script[\s\S]*?>[\s\S]*?<\s*\/\s*script\s*>/gi, '')
            .replace(/on\w+\s*=/gi, '')
            .slice(0, 2000),
        hideStreamUsers: hideStreamUsers === 'hidden' ? 'hidden' : 'anonymous',
        navOrder: (Array.isArray(navOrder) ? navOrder : existingConfig.navOrder || ['home', 'discover', 'users', 'status', 'analytics', 'mediastack', 'request', 'settings', 'logout'])
            .filter((key) => key !== 'maintenance'),
        navHiddenKeys: (() => {
            const ALWAYS = new Set(['home', 'settings', 'logout', 'preferences']);
            const incoming = Array.isArray(navHiddenKeys) ? navHiddenKeys : existingConfig.navHiddenKeys;
            if (!Array.isArray(incoming)) return [];
            const seen = new Set();
            const result = [];
            for (const raw of incoming) {
                const key = String(raw || '').trim();
                if (!key || ALWAYS.has(key) || seen.has(key)) continue;
                seen.add(key);
                result.push(key);
            }
            return result;
        })(),
        defaultLibraryIds: Array.isArray(defaultLibraryIds) ? defaultLibraryIds : null,
        use24HourClock: !!use24HourClock,
        // Open self-serve temp access is retired; invite duration still controls timed membership.
        allowTemporaryAccess: false,
        publicStatusEnabled: publicStatusEnabled === true,
        publicStatusExplicitlyConfigured: true,
        showLoginServerStats: showLoginServerStats === true,
        showPosterQualityBadges: showPosterQualityBadges !== false,
        autoBackupEnabled: !!autoBackupEnabled,
        autoBackupIntervalDays: Math.max(1, parseInt(autoBackupIntervalDays, 10) || 2),
        autoBackupRetentionCount: Math.max(1, parseInt(autoBackupRetentionCount, 10) || 10),
        scannerEnabled: scannerEnabled !== undefined ? !!scannerEnabled : !!existingConfig.scannerEnabled,
        scannerHomeWidgetEnabled: (() => {
            const scannerOn = scannerEnabled !== undefined ? !!scannerEnabled : !!existingConfig.scannerEnabled;
            if (!scannerOn) return false;
            return scannerHomeWidgetEnabled !== undefined
                ? !!scannerHomeWidgetEnabled
                : !!existingConfig.scannerHomeWidgetEnabled;
        })(),
        scannerWebhooksVisible: scannerWebhooksVisible !== undefined
            ? !!scannerWebhooksVisible
            : existingConfig.scannerWebhooksVisible !== false,
        scannerManualPathVisible: scannerManualPathVisible !== undefined
            ? !!scannerManualPathVisible
            : existingConfig.scannerManualPathVisible !== false,
        scanner: nextScannerConfig,
        upgraderEnabled: upgraderEnabled !== undefined ? !!upgraderEnabled : !!existingConfig.upgraderEnabled,
        upgraderAutomationEnabled: upgraderAutomationEnabled !== undefined ? !!upgraderAutomationEnabled : !!existingConfig.upgraderAutomationEnabled,
        upgraderHuntMissingEpisodes: upgraderHuntMissingEpisodes !== undefined
            ? !!upgraderHuntMissingEpisodes
            : existingConfig.upgraderHuntMissingEpisodes !== false,
        upgraderHuntAvailableMovies: upgraderHuntAvailableMovies !== undefined
            ? !!upgraderHuntAvailableMovies
            : existingConfig.upgraderHuntAvailableMovies !== false,
        upgraderProfileMap: upgraderProfileMap && typeof upgraderProfileMap === 'object' ? upgraderProfileMap : (existingConfig.upgraderProfileMap || {}),
        upgraderDefaultPreset: String(upgraderDefaultPreset || existingConfig.upgraderDefaultPreset || 'score_gap'),
        upgraderMinSizeGB: Math.max(0, Number(upgraderMinSizeGB ?? existingConfig.upgraderMinSizeGB ?? 5) || 5),
        upgraderMaxActionsPerHour: Math.max(1, Number(upgraderMaxActionsPerHour ?? existingConfig.upgraderMaxActionsPerHour ?? 25) || 25),
        upgraderMinScoreDelta: Math.max(0, Number(upgraderMinScoreDelta ?? existingConfig.upgraderMinScoreDelta ?? 10) || 0),
        upgraderPreferences: {
            preferDolbyVisionHdr: (upgraderPreferences || existingConfig.upgraderPreferences)?.preferDolbyVisionHdr !== false,
            preferAtmos: (upgraderPreferences || existingConfig.upgraderPreferences)?.preferAtmos !== false,
            preferRemux: (upgraderPreferences || existingConfig.upgraderPreferences)?.preferRemux !== false,
            preferSeasonPacks: (upgraderPreferences || existingConfig.upgraderPreferences)?.preferSeasonPacks !== false,
        },
        upgraderPreferenceWeights: {
            dolbyVisionHdr: Number((upgraderPreferenceWeights || existingConfig.upgraderPreferenceWeights)?.dolbyVisionHdr ?? 50) || 0,
            atmos: Number((upgraderPreferenceWeights || existingConfig.upgraderPreferenceWeights)?.atmos ?? 25) || 0,
            remux: Number((upgraderPreferenceWeights || existingConfig.upgraderPreferenceWeights)?.remux ?? 40) || 0,
            seasonPack: Number((upgraderPreferenceWeights || existingConfig.upgraderPreferenceWeights)?.seasonPack ?? 30) || 0,
        },
        upgraderDefaultSort: ['title', 'sizeGB', 'watchCount', 'addedAt', 'score', 'customFormatScore'].includes(String(upgraderDefaultSort || existingConfig.upgraderDefaultSort || 'sizeGB'))
            ? String(upgraderDefaultSort || existingConfig.upgraderDefaultSort || 'sizeGB') : 'sizeGB',
        upgraderDrawerPosition: ['sidebar', 'modal'].includes(String(upgraderDrawerPosition || existingConfig.upgraderDrawerPosition || 'sidebar'))
            ? String(upgraderDrawerPosition || existingConfig.upgraderDrawerPosition || 'sidebar') : 'sidebar',
        qcCleanupAutomationEnabled: qcCleanupAutomationEnabled !== undefined
            ? !!qcCleanupAutomationEnabled
            : !!existingConfig.qcCleanupAutomationEnabled,
        qcMetaDlMinutes: Math.max(1, Number(qcMetaDlMinutes ?? existingConfig.qcMetaDlMinutes ?? 30) || 30),
        qcStalledHours: Math.max(1, Number(qcStalledHours ?? existingConfig.qcStalledHours ?? 6) || 6),
        qcCompletedNotImportingMinutes: Math.max(
            1,
            Number(qcCompletedNotImportingMinutes ?? existingConfig.qcCompletedNotImportingMinutes ?? 60) || 60,
        ),
        qcResearchThrottleHours: Math.max(
            1,
            Number(qcResearchThrottleHours ?? existingConfig.qcResearchThrottleHours ?? 24) || 24,
        ),
        qcSnoozeDefaultHours: Math.max(1, Number(qcSnoozeDefaultHours ?? existingConfig.qcSnoozeDefaultHours ?? 24) || 24),
        qcDiscordDigestEnabled: qcDiscordDigestEnabled !== undefined
            ? !!qcDiscordDigestEnabled
            : !!existingConfig.qcDiscordDigestEnabled,
        qcPreferImportDiscordOnly: qcPreferImportDiscordOnly !== undefined
            ? !!qcPreferImportDiscordOnly
            : existingConfig.qcPreferImportDiscordOnly !== false,
        qcQbitUrl: String(qcQbitUrl ?? existingConfig.qcQbitUrl ?? '').trim(),
        qcQbitUsername: String(qcQbitUsername ?? existingConfig.qcQbitUsername ?? '').trim(),
        qcQbitPassword: resolveSecret(qcQbitPassword, existingConfig.qcQbitPassword),
        qcSabUrl: String(qcSabUrl ?? existingConfig.qcSabUrl ?? '').trim(),
        qcSabApiKey: resolveSecret(qcSabApiKey, existingConfig.qcSabApiKey),
        qcBlockedExtensions: Array.isArray(qcBlockedExtensions)
            ? [...new Set(qcBlockedExtensions.map((entry) => String(entry || '').trim().replace(/^\*\./, '').replace(/^\./, '').toLowerCase()).filter(Boolean))].sort()
            : (Array.isArray(existingConfig.qcBlockedExtensions) ? existingConfig.qcBlockedExtensions : []),
        dashboardLayout: ('dashboardLayout' in body)
            ? normalizeSectionLayout(body.dashboardLayout)
            : normalizeSectionLayout(existingConfig.dashboardLayout),
    });

    // Drop retired Cleaner / Library Maintenance flag if present on older configs.
    delete config.maintenanceExperimentalEnabled;
    // Retired request-app integration keys must not survive settings writes.
    for (const key of RETIRED_REQUEST_APP_KEYS) delete config[key];

    return {
        config,
        normalizedMediaServerType,
        normalizedToken,
        normalizedServerIdentifier,
    };
};
