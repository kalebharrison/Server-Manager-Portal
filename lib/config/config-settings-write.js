import { normalizeArrConfig, sanitizeArrInstances } from '../media-stack/arr-instances.js';
import { normalizeCacheRefreshMinutes } from '../cache/cache-refresh.js';

export const createResolveConfigIntegrationUrl = (sanitizeIntegrationUrl) => async (incoming, existing) => {
    const existingValue = typeof existing === 'string' ? existing : '';
    // Keep existing URL as-is when caller did not change the value.
    // This prevents unrelated settings edits from failing on legacy private URLs.
    if (incoming === undefined || incoming === null) return existingValue;
    const incomingValue = String(incoming).trim();
    if (incomingValue === String(existingValue || '').trim()) return existingValue;
    return sanitizeIntegrationUrl(incomingValue);
};

export const createResolveSecret = (secretMask) => (incoming, existing) => {
    if (incoming === undefined || incoming === null) return existing || '';
    if (incoming === secretMask) return existing || '';
    return String(incoming);
};

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
        plexServerUrl: plexServerUrlFromBody, jellyfinUrl, jellyfinApiKey,
        smtpHost, smtpPort, smtpUser, smtpPass, smtpFrom, smtpSecure, emailDaysBefore,
        newsletterFrequency, newsletterDay, publicDomain, requestUrl, contactUrl, contactWhatsApp, contactEmail,
        sonarrUrl, sonarrApiKey, radarrUrl, radarrApiKey, lidarrUrl, lidarrApiKey, arrInstances, tautulliUrl, tautulliApiKey, jellystatUrl, jellystatApiKey,
        requestAppType, requestAppUrl, requestAppApiKey, requestAppMembershipSync, ombiUrl, ombiApiKey,
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

    let safeSonarrUrl = '';
    let safeRadarrUrl = '';
    let safeLidarrUrl = '';
    let safeTautulliUrl = '';
    let safeJellystatUrl = '';
    let safeRequestAppUrl = '';
    let safeOmbiUrl = '';
    let safeJellyfinUrl = '';
    let safePlexServerUrl = existingConfig.plexServerUrl || '';

    try {
        [
            safeSonarrUrl,
            safeRadarrUrl,
            safeLidarrUrl,
            safeTautulliUrl,
            safeJellystatUrl,
            safeRequestAppUrl,
            safeOmbiUrl,
            safeJellyfinUrl,
            safePlexServerUrl,
        ] = await Promise.all([
            resolveConfigIntegrationUrl(sonarrUrl, existingConfig.sonarrUrl || ''),
            resolveConfigIntegrationUrl(radarrUrl, existingConfig.radarrUrl || ''),
            resolveConfigIntegrationUrl(lidarrUrl, existingConfig.lidarrUrl || ''),
            resolveConfigIntegrationUrl(tautulliUrl, existingConfig.tautulliUrl || ''),
            resolveConfigIntegrationUrl(jellystatUrl, existingConfig.jellystatUrl || ''),
            resolveConfigIntegrationUrl(requestAppUrl, existingConfig.requestAppUrl || ''),
            resolveConfigIntegrationUrl(ombiUrl, existingConfig.ombiUrl || ''),
            resolveConfigIntegrationUrl(jellyfinUrl, existingConfig.jellyfinUrl || ''),
            plexServerUrlFromBody !== undefined
                ? resolveConfigIntegrationUrl(plexServerUrlFromBody, existingConfig.plexServerUrl || '')
                : Promise.resolve(existingConfig.plexServerUrl || ''),
        ]);
    } catch (e) {
        throw new Error(`Invalid integration URL: ${e.message}`);
    }

    let safeArrInstances;
    try {
        safeArrInstances = await sanitizeArrInstances(arrInstances, existingConfig, {
            resolveSecret,
            resolveUrl: resolveConfigIntegrationUrl,
        });
    } catch (e) {
        throw new Error(`Invalid automation instance: ${e.message}`);
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
        smtpUser: smtpUser || '',
        smtpPass: resolveSecret(smtpPass, existingConfig.smtpPass),
        smtpFrom: smtpFrom || '',
        smtpSecure: !!smtpSecure,
        emailDaysBefore: parseInt(emailDaysBefore, 10) || 7,
        newsletterFrequency: newsletterFrequency || 'disabled',
        newsletterDay: parseInt(newsletterDay, 10) || 0,
        inactiveCleanupEnabled: !!inactiveCleanupEnabled,
        inactiveCleanupDays: parseInt(inactiveCleanupDays, 10) || 90,
        publicDomain: publicDomain || 'https://portal.yourdomain.com',
        requestUrl: requestUrl === undefined ? (existingConfig.requestUrl || 'https://yourdomain.com') : (requestUrl || 'https://yourdomain.com'),
        contactUrl: contactUrl || '',
        contactWhatsApp: contactWhatsApp || '',
        contactEmail: contactEmail || '',
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
        primaryColor: primaryColor || '#F7C600',
        customLogoUrl: customLogoUrl || '',
        brandingTheme: ['plex', 'slate', 'nordic', 'jellyfin', 'emerald', 'midnight'].includes(String(brandingTheme || '').toLowerCase()) ? String(brandingTheme).toLowerCase() : (existingConfig.brandingTheme || 'plex'),
        backgroundImageUrl: backgroundImageUrl || '',
        useScrollRevealAnimations: !!useScrollRevealAnimations,
        useCinematicLoading: !!useCinematicLoading,
        useBrandedSkeleton: useBrandedSkeleton !== false,
        useTrendingSlideshow: !!useTrendingSlideshow,
        trendingSlideshowInterval: parseInt(trendingSlideshowInterval, 10) || 30,
        tmdbApiKey: resolveSecret(tmdbApiKey, existingConfig.tmdbApiKey),
        tvdbApiKey: resolveSecret(tvdbApiKey, existingConfig.tvdbApiKey),
        tvdbPin: resolveSecret(tvdbPin, existingConfig.tvdbPin),
        cacheRefreshMinutes: normalizeCacheRefreshMinutes(cacheRefreshMinutes ?? existingConfig.cacheRefreshMinutes),
        referralEnabled: !!referralEnabled,
        referralTrialDays: parseInt(referralTrialDays, 10) || 3,
        referralRewardDays: parseInt(referralRewardDays, 10) || 7,
        announcement: announcement || '',
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
        useTrendingSlideshowOnLogin: useTrendingSlideshowOnLogin !== undefined ? !!useTrendingSlideshowOnLogin : (existingConfig.useTrendingSlideshowOnLogin !== false),
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
