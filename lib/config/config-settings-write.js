import { normalizeArrConfig, sanitizeArrInstances } from '../media-stack/arr-instances.js';
import { normalizeCacheRefreshMinutes } from '../cache/cache-refresh.js';
import { buildBrandingFields } from './config-settings-branding-fields.js';
import {
    createResolveConfigIntegrationUrl,
    createResolveSecret,
    resolveSafeIntegrationUrls,
} from './config-settings-resolvers.js';
import { buildPublicContactUrlFields } from './config-settings-url-fields.js';

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
        newsletterFrequency, newsletterDay, publicDomain, requestUrl, contactUrl, contactWhatsApp, contactEmail,
        sonarrApiKey, radarrApiKey, lidarrApiKey, arrInstances, tautulliApiKey, jellystatApiKey,
        requestAppType, requestAppApiKey, requestAppMembershipSync, ombiApiKey, jellyfinApiKey,
        inactiveCleanupEnabled, inactiveCleanupDays,
        primaryColor, customLogoUrl, brandingTheme, backgroundImageUrl, useScrollRevealAnimations, useCinematicLoading, useBrandedSkeleton, useTrendingSlideshow, trendingSlideshowInterval, tmdbApiKey, tvdbApiKey, tvdbPin, cacheRefreshMinutes, referralEnabled, referralTrialDays, referralRewardDays, announcement, navOrder, hideStreamUsers, defaultLibraryIds, use24HourClock, allowTemporaryAccess, showPosterQualityBadges,
        publicStatusEnabled, showLoginServerStats, autoBackupEnabled, autoBackupIntervalDays, autoBackupRetentionCount, dashboardLayout,
        useTrendingSlideshowOnLogin,
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
        safeRequestAppUrl,
        safeOmbiUrl,
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
        contactWhatsApp,
        contactEmail,
        existingConfig,
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
        requestAppType: ['none', 'seerr', 'overseerr', 'jellyseerr', 'ombi'].includes(String(requestAppType || '').toLowerCase()) ? (String(requestAppType).toLowerCase() === 'overseerr' ? 'seerr' : String(requestAppType).toLowerCase()) : (existingConfig.requestAppType || 'none'),
        requestAppUrl: safeRequestAppUrl,
        requestAppApiKey: resolveSecret(requestAppApiKey, existingConfig.requestAppApiKey),
        requestAppMembershipSync: requestAppMembershipSync !== false,
        ombiUrl: safeOmbiUrl,
        ombiApiKey: resolveSecret(ombiApiKey, existingConfig.ombiApiKey),
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
        dashboardLayout: ('dashboardLayout' in body)
            ? normalizeSectionLayout(body.dashboardLayout)
            : normalizeSectionLayout(existingConfig.dashboardLayout),
    });

    // Drop retired Cleaner / Library Maintenance flag if present on older configs.
    delete config.maintenanceExperimentalEnabled;

    return {
        config,
        normalizedMediaServerType,
        normalizedToken,
        normalizedServerIdentifier,
    };
};
