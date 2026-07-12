import jwt from 'jsonwebtoken';
import { registerConfigAdminUtilityRoutes } from './config-admin-utility-routes.js';
import { registerConfigIntegrationTestRoutes } from './config-integration-test-routes.js';
import { registerPublicConfigRoutes } from './config-public-routes.js';

export const registerConfigRoutes = ({
    app,
    requireAdmin,
    setupRateLimit,
    publicReadRateLimit,
    configPath,
    secretMask,
    setupToken,
    jwtSecret,
    basePath,
    appVersion,
    defaultDashboardLayout,
    loadFile,
    saveFile,
    isPortalConfigured,
    isJellyfinConfigured,
    normalizePlexToken,
    resolveConfiguredPlexServerUrl,
    verifyInitialSetupPlexOwner,
    resolveCurrentAdmin,
    canRunInitialSetup,
    fetchOwnedPlexServers,
    validatePlexServerAdminToken,
    sanitizeIntegrationUrl,
    syncAdminPlexIdFromConfigToken,
    invalidatePlexConnectionCaches,
    invalidateAdminProfileCache,
    invalidateArrCatalogCache,
    computeNextBackupRun,
    systemJobs,
    startBackgroundService,
    buildMaintenanceMediaIndex,
    normalizeSectionLayout,
    sendEmail,
    resolveIntegrationUrlForFetch,
    fetchWithTimeout,
    getPlexConnectionUri,
    log,
}) => {
    const CONFIG_PATH = configPath;
    const SECRET_MASK = secretMask;
    const SETUP_TOKEN = setupToken;
    const JWT_SECRET = jwtSecret;
    const BASE_PATH = basePath;
    const DEFAULT_DASHBOARD_LAYOUT = defaultDashboardLayout;

    // Config endpoints
    app.get('/api/config', requireAdmin, async (req, res) => {
        const config = await loadFile(CONFIG_PATH, {});
        const isConfigured = isPortalConfigured(config);
            const contactWhatsApp = config.contactWhatsApp || '';
            const contactEmail = config.contactEmail || '';
    
        if (isConfigured) {
            res.json({
                configured: true,
                settings: {
                    token: config.plexToken ? SECRET_MASK : '',
                    mediaServerType: config.mediaServerType || 'plex',
                    serverIdentifier: config.serverIdentifier,
                    plexServerUrl: config.plexServerUrl || '',
                    jellyfinUrl: config.jellyfinUrl || '',
                    jellyfinApiKey: config.jellyfinApiKey ? SECRET_MASK : '',
                    checkIntervalMinutes: config.checkIntervalMinutes || 60,
                    smtpHost: config.smtpHost || '',
                    smtpPort: config.smtpPort || 587,
                    smtpUser: config.smtpUser || '',
                    smtpPass: config.smtpPass ? SECRET_MASK : '',
                    smtpFrom: config.smtpFrom || '',
                    smtpSecure: !!config.smtpSecure,
                    emailDaysBefore: config.emailDaysBefore || 7,
                    newsletterFrequency: config.newsletterFrequency || 'disabled',
                    newsletterDay: config.newsletterDay || 0,
                    inactiveCleanupEnabled: !!config.inactiveCleanupEnabled,
                    inactiveCleanupDays: config.inactiveCleanupDays || 90,
                    publicDomain: config.publicDomain || 'https://portal.yourdomain.com',
                    requestUrl: config.requestUrl || 'https://yourdomain.com',
                    contactUrl: config.contactUrl || '',
                    contactWhatsApp,
                    contactEmail,
                    sonarrUrl: config.sonarrUrl || '',
                    sonarrApiKey: config.sonarrApiKey ? SECRET_MASK : '',
                    radarrUrl: config.radarrUrl || '',
                    radarrApiKey: config.radarrApiKey ? SECRET_MASK : '',
                    lidarrUrl: config.lidarrUrl || '',
                    lidarrApiKey: config.lidarrApiKey ? SECRET_MASK : '',
                    tautulliUrl: config.tautulliUrl || '',
                    tautulliApiKey: config.tautulliApiKey ? SECRET_MASK : '',
                    jellystatUrl: config.jellystatUrl || '',
                    jellystatApiKey: config.jellystatApiKey ? SECRET_MASK : '',
                    requestAppType: config.requestAppType === 'overseerr' ? 'seerr' : (config.requestAppType || 'none'),
                    requestAppUrl: config.requestAppUrl || '',
                    requestAppApiKey: config.requestAppApiKey ? SECRET_MASK : '',
                    primaryColor: config.primaryColor || '#F7C600',
                    customLogoUrl: config.customLogoUrl || '',
                    brandingTheme: config.brandingTheme || 'plex',
                    backgroundImageUrl: config.backgroundImageUrl || '',
                    useScrollRevealAnimations: !!config.useScrollRevealAnimations,
                    useCinematicLoading: !!config.useCinematicLoading,
                    useBrandedSkeleton: config.useBrandedSkeleton !== false,
                    useTrendingSlideshow: !!config.useTrendingSlideshow,
                    trendingSlideshowInterval: config.trendingSlideshowInterval || 30,
                    tmdbApiKey: config.tmdbApiKey ? SECRET_MASK : '',
                    tvdbApiKey: config.tvdbApiKey ? SECRET_MASK : '',
                    tvdbPin: config.tvdbPin ? SECRET_MASK : '',
                    referralEnabled: !!config.referralEnabled,
                    referralTrialDays: config.referralTrialDays || 3,
                    referralRewardDays: config.referralRewardDays || 7,
                    announcement: config.announcement || '',
                    hideStreamUsers: config.hideStreamUsers === 'hidden' ? 'hidden' : 'anonymous',
                    navOrder: config.navOrder || ['home', 'discover', 'users', 'status', 'analytics', 'mediastack', 'maintenance', 'request', 'settings', 'logout'],
                    defaultLibraryIds: config.defaultLibraryIds || null,
                    use24HourClock: !!config.use24HourClock,
                    allowTemporaryAccess: !!config.allowTemporaryAccess,
                    publicStatusEnabled: config.publicStatusEnabled === true && config.publicStatusExplicitlyConfigured === true,
                    showLoginServerStats: config.showLoginServerStats === true,
                    showPosterQualityBadges: config.showPosterQualityBadges !== false,
                    autoBackupEnabled: !!config.autoBackupEnabled,
                    autoBackupIntervalDays: Number(config.autoBackupIntervalDays) > 0 ? Number(config.autoBackupIntervalDays) : 2,
                    autoBackupRetentionCount: Number(config.autoBackupRetentionCount) > 0 ? Number(config.autoBackupRetentionCount) : 10,
                    maintenanceExperimentalEnabled: !!config.maintenanceExperimentalEnabled,
                    dashboardLayout: normalizeSectionLayout(config.dashboardLayout),
                    useTrendingSlideshowOnLogin: config.useTrendingSlideshowOnLogin !== false
                },
            });
        } else {
            res.json({
                configured: false,
                settings: {
                    token: '',
                    mediaServerType: 'plex',
                    serverIdentifier: '',
                    plexServerUrl: '',
                    jellyfinUrl: '',
                    jellyfinApiKey: '',
                    checkIntervalMinutes: 60,
                    smtpHost: '',
                    smtpPort: 587,
                    smtpUser: '',
                    smtpPass: '',
                    smtpFrom: '',
                    smtpSecure: false,
                    emailDaysBefore: 7,
                    newsletterFrequency: 'disabled',
                    newsletterDay: 0,
                    inactiveCleanupEnabled: false,
                    inactiveCleanupDays: 90,
                    publicDomain: 'https://portal.yourdomain.com',
                    requestUrl: 'https://yourdomain.com',
                    contactUrl: '',
                    sonarrUrl: '',
                    sonarrApiKey: '',
                    radarrUrl: '',
                    radarrApiKey: '',
                    lidarrUrl: '',
                    lidarrApiKey: '',
                    tautulliUrl: '',
                    tautulliApiKey: '',
                    jellystatUrl: '',
                    jellystatApiKey: '',
                    requestAppType: 'none',
                    requestAppUrl: '',
                    requestAppApiKey: '',
                    primaryColor: '#F7C600',
                    customLogoUrl: '',
                    brandingTheme: 'plex',
                    backgroundImageUrl: '',
                    useScrollRevealAnimations: false,
                    useCinematicLoading: false,
                    useBrandedSkeleton: true,
                    useTrendingSlideshow: false,
                    trendingSlideshowInterval: 30,
                    tmdbApiKey: '',
                    tvdbApiKey: '',
                    tvdbPin: '',
                    referralEnabled: false,
                    referralTrialDays: 3,
                    referralRewardDays: 7,
                    announcement: '',
                    hideStreamUsers: 'anonymous',
                    navOrder: ['home', 'discover', 'users', 'status', 'analytics', 'mediastack', 'maintenance', 'request', 'settings', 'logout'],
                    defaultLibraryIds: null,
                    use24HourClock: false,
                    allowTemporaryAccess: false,
                    publicStatusEnabled: false,
                    showLoginServerStats: false,
                    showPosterQualityBadges: true,
                    autoBackupEnabled: false,
                    autoBackupIntervalDays: 2,
                    autoBackupRetentionCount: 10,
                    maintenanceExperimentalEnabled: false,
                    dashboardLayout: DEFAULT_DASHBOARD_LAYOUT
                },
            });
        }
    });
    
    app.post('/api/config', setupRateLimit, async (req, res) => {
        const {
            token, mediaServerType, serverIdentifier, checkIntervalMinutes,
            plexServerUrl: plexServerUrlFromBody, jellyfinUrl, jellyfinApiKey,
            smtpHost, smtpPort, smtpUser, smtpPass, smtpFrom, smtpSecure, emailDaysBefore,
            newsletterFrequency, newsletterDay, publicDomain, requestUrl, contactUrl, contactWhatsApp, contactEmail,
            sonarrUrl, sonarrApiKey, radarrUrl, radarrApiKey, lidarrUrl, lidarrApiKey, tautulliUrl, tautulliApiKey, jellystatUrl, jellystatApiKey,
            requestAppType, requestAppUrl, requestAppApiKey,
            inactiveCleanupEnabled, inactiveCleanupDays,
            primaryColor, customLogoUrl, brandingTheme, backgroundImageUrl, useScrollRevealAnimations, useCinematicLoading, useBrandedSkeleton, useTrendingSlideshow, trendingSlideshowInterval, tmdbApiKey, tvdbApiKey, tvdbPin, referralEnabled, referralTrialDays, referralRewardDays, announcement, navOrder, hideStreamUsers, defaultLibraryIds, use24HourClock, allowTemporaryAccess, showPosterQualityBadges,
            publicStatusEnabled, showLoginServerStats, autoBackupEnabled, autoBackupIntervalDays, autoBackupRetentionCount, maintenanceExperimentalEnabled, dashboardLayout,
            useTrendingSlideshowOnLogin
        } = req.body;
    
        const existingConfig = await loadFile(CONFIG_PATH, {});
        const normalizedMediaServerType = ['plex', 'jellyfin'].includes(String(mediaServerType || '').toLowerCase())
            ? String(mediaServerType || '').toLowerCase()
            : (existingConfig.mediaServerType || 'plex');
        const normalizedToken = normalizePlexToken(token);
        const normalizedServerIdentifier = String(serverIdentifier).trim();
        const isConfigured = isPortalConfigured(existingConfig);
        const wasMaintenanceEnabled = !!existingConfig.maintenanceExperimentalEnabled;
    
        if (normalizedMediaServerType === 'plex' && (!normalizedToken || !normalizedServerIdentifier)) {
            return res.status(400).json({ error: 'Plex token and serverIdentifier are required.' });
        }
        if (normalizedMediaServerType === 'jellyfin' && (!jellyfinUrl || !jellyfinApiKey)) {
            return res.status(400).json({ error: 'Jellyfin URL and API key are required.' });
        }
    
        if (isConfigured) {
            const sessionToken = req.cookies && req.cookies.session;
            if (!sessionToken) {
                return res.status(403).json({ error: 'Forbidden: App is already configured. Please log in as admin to modify settings.' });
            }
            try {
                const decoded = jwt.verify(sessionToken, JWT_SECRET);
                const isAdmin = await resolveCurrentAdmin(decoded, existingConfig);
                if (!isAdmin) {
                    return res.status(403).json({ error: 'Forbidden: Admins only.' });
                }
                req.user = decoded;
            } catch (e) {
                return res.status(403).json({ error: 'Forbidden: Invalid or expired session. Please log in again.' });
            }
        } else if (!canRunInitialSetup(req)) {
            if (normalizedMediaServerType === 'jellyfin') {
                return res.status(403).json({ error: 'Initial setup is restricted. Configure SETUP_TOKEN or run setup from localhost.' });
            }
            const candidatePlexServerUrl = (plexServerUrlFromBody !== undefined
                ? String(plexServerUrlFromBody || '').trim()
                : String(existingConfig.plexServerUrl || '').trim()) || resolveConfiguredPlexServerUrl(existingConfig);
            const verifiedPlexOwner = await verifyInitialSetupPlexOwner(normalizedToken, normalizedServerIdentifier, candidatePlexServerUrl);
            if (!verifiedPlexOwner) {
                if (!SETUP_TOKEN) {
                    return res.status(403).json({ error: 'Initial setup is restricted. Sign in with the Plex server owner account, configure SETUP_TOKEN, or run setup from localhost.' });
                }
                return res.status(403).json({ error: 'Initial setup denied: invalid setup token or Plex server owner verification failed.' });
            }
        }
        const interval = parseInt(checkIntervalMinutes, 10);
        let safeSonarrUrl = '';
        let safeRadarrUrl = '';
        let safeLidarrUrl = '';
        let safeTautulliUrl = '';
        let safeJellystatUrl = '';
        let safeRequestAppUrl = '';
        let safeJellyfinUrl = '';
        const resolveConfigIntegrationUrl = (incoming, existing) => {
            const existingValue = typeof existing === 'string' ? existing : '';
            // Keep existing URL as-is when caller did not change the value.
            // This prevents unrelated settings edits from failing on legacy private URLs.
            if (incoming === undefined || incoming === null) return existingValue;
            const incomingValue = String(incoming).trim();
            if (incomingValue === String(existingValue || '').trim()) return existingValue;
            return sanitizeIntegrationUrl(incomingValue);
        };
        try {
            safeSonarrUrl = resolveConfigIntegrationUrl(sonarrUrl, existingConfig.sonarrUrl || '');
            safeRadarrUrl = resolveConfigIntegrationUrl(radarrUrl, existingConfig.radarrUrl || '');
            safeLidarrUrl = resolveConfigIntegrationUrl(lidarrUrl, existingConfig.lidarrUrl || '');
            safeTautulliUrl = resolveConfigIntegrationUrl(tautulliUrl, existingConfig.tautulliUrl || '');
            safeJellystatUrl = resolveConfigIntegrationUrl(jellystatUrl, existingConfig.jellystatUrl || '');
            safeRequestAppUrl = resolveConfigIntegrationUrl(requestAppUrl, existingConfig.requestAppUrl || '');
            safeJellyfinUrl = resolveConfigIntegrationUrl(jellyfinUrl, existingConfig.jellyfinUrl || '');
        } catch (e) {
            return res.status(400).json({ error: `Invalid integration URL: ${e.message}` });
        }
    
        // Secrets are returned to the UI as SECRET_MASK. If the UI sends the mask
        // back unchanged, keep the existing stored value rather than overwriting it.
        const resolveSecret = (incoming, existing) => {
            if (incoming === undefined || incoming === null) return existing || '';
            if (incoming === SECRET_MASK) return existing || '';
            return String(incoming);
        };
    
        const config = {
            ...existingConfig,
            mediaServerType: normalizedMediaServerType,
            plexToken: normalizedMediaServerType === 'jellyfin' ? resolveSecret(token, existingConfig.plexToken) : resolveSecret(normalizedToken, existingConfig.plexToken),
            serverIdentifier: normalizedMediaServerType === 'jellyfin' ? (normalizedServerIdentifier || existingConfig.serverIdentifier || '') : normalizedServerIdentifier,
            plexServerUrl: (plexServerUrlFromBody !== undefined ? String(plexServerUrlFromBody || '').trim() : existingConfig.plexServerUrl) || '',
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
            tautulliUrl: safeTautulliUrl,
            tautulliApiKey: resolveSecret(tautulliApiKey, existingConfig.tautulliApiKey),
            jellystatUrl: safeJellystatUrl,
            jellystatApiKey: resolveSecret(jellystatApiKey, existingConfig.jellystatApiKey),
            requestAppType: ['none', 'seerr', 'overseerr', 'jellyseerr', 'ombi'].includes(String(requestAppType || '').toLowerCase()) ? (String(requestAppType).toLowerCase() === 'overseerr' ? 'seerr' : String(requestAppType).toLowerCase()) : (existingConfig.requestAppType || 'none'),
            requestAppUrl: safeRequestAppUrl,
            requestAppApiKey: resolveSecret(requestAppApiKey, existingConfig.requestAppApiKey),
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
            referralEnabled: !!referralEnabled,
            referralTrialDays: parseInt(referralTrialDays, 10) || 3,
            referralRewardDays: parseInt(referralRewardDays, 10) || 7,
            announcement: announcement || '',
            hideStreamUsers: hideStreamUsers === 'hidden' ? 'hidden' : 'anonymous',
            navOrder: Array.isArray(navOrder) ? navOrder : existingConfig.navOrder || ['home', 'discover', 'users', 'status', 'analytics', 'mediastack', 'maintenance', 'request', 'settings', 'logout'],
            defaultLibraryIds: Array.isArray(defaultLibraryIds) ? defaultLibraryIds : null,
            use24HourClock: !!use24HourClock,
            allowTemporaryAccess: !!allowTemporaryAccess,
            publicStatusEnabled: publicStatusEnabled === true,
            publicStatusExplicitlyConfigured: true,
            showLoginServerStats: showLoginServerStats === true,
            showPosterQualityBadges: showPosterQualityBadges !== false,
            autoBackupEnabled: !!autoBackupEnabled,
            autoBackupIntervalDays: Math.max(1, parseInt(autoBackupIntervalDays, 10) || 2),
            autoBackupRetentionCount: Math.max(1, parseInt(autoBackupRetentionCount, 10) || 10),
            maintenanceExperimentalEnabled: maintenanceExperimentalEnabled !== undefined ? !!maintenanceExperimentalEnabled : !!existingConfig.maintenanceExperimentalEnabled,
            useTrendingSlideshowOnLogin: useTrendingSlideshowOnLogin !== undefined ? !!useTrendingSlideshowOnLogin : (existingConfig.useTrendingSlideshowOnLogin !== false),
            dashboardLayout: ('dashboardLayout' in req.body)
                ? normalizeSectionLayout(req.body.dashboardLayout)
                : normalizeSectionLayout(existingConfig.dashboardLayout)
        };
        await saveFile(CONFIG_PATH, config);
        await syncAdminPlexIdFromConfigToken(config, { persist: true });
        // Invalidate caches tied to the Plex token/server so changes take effect immediately.
        invalidatePlexConnectionCaches();
        invalidateAdminProfileCache();
        invalidateArrCatalogCache();
        systemJobs.autoBackup.nextRun = config.autoBackupEnabled ? computeNextBackupRun(config) : null;
        log('Configuration saved successfully.');
        startBackgroundService(); // (Re)start service with new config
        const becameConfigured = !isConfigured && isPortalConfigured(config);
        const maintenanceJustEnabled = !wasMaintenanceEnabled && !!config.maintenanceExperimentalEnabled;
        if ((becameConfigured || maintenanceJustEnabled) && !!config.maintenanceExperimentalEnabled) {
            // Kick an immediate index build after setup/enablement so rules are usable right away.
            setTimeout(async () => {
                try {
                    await buildMaintenanceMediaIndex({ actor: req.user || { username: 'System', email: 'system@local' }, force: true });
                    log('Maintenance index rebuilt after setup/config enablement.');
                } catch (e) {
                    log(`Post-setup maintenance index rebuild failed: ${e.message}`);
                }
            }, 1000);
        }
        res.json({ message: 'Configuration saved.' });
    });
    
    registerPublicConfigRoutes({
        app,
        publicReadRateLimit,
        configPath: CONFIG_PATH,
        basePath: BASE_PATH,
        appVersion,
        defaultDashboardLayout: DEFAULT_DASHBOARD_LAYOUT,
        loadFile,
        normalizeSectionLayout,
        log,
    });
    
    registerConfigAdminUtilityRoutes({
        app,
        requireAdmin,
        configPath: CONFIG_PATH,
        secretMask: SECRET_MASK,
        loadFile,
        sendEmail,
        log,
    });
    
    registerConfigIntegrationTestRoutes({
        app,
        setupRateLimit,
        configPath: CONFIG_PATH,
        secretMask: SECRET_MASK,
        jwtSecret: JWT_SECRET,
        loadFile,
        isPortalConfigured,
        resolveCurrentAdmin,
        normalizePlexToken,
        fetchOwnedPlexServers,
        validatePlexServerAdminToken,
        verifyInitialSetupPlexOwner,
        canRunInitialSetup,
        sanitizeIntegrationUrl,
        resolveIntegrationUrlForFetch,
        fetchWithTimeout,
        invalidatePlexConnectionCaches,
        getPlexConnectionUri,
        log,
    });
};
