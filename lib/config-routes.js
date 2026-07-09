import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import fetch from 'node-fetch';
import jwt from 'jsonwebtoken';

export const registerConfigRoutes = ({
    app,
    requireAdmin,
    setupRateLimit,
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
                    referralEnabled: !!config.referralEnabled,
                    referralTrialDays: config.referralTrialDays || 3,
                    referralRewardDays: config.referralRewardDays || 7,
                    announcement: config.announcement || '',
                    hideStreamUsers: config.hideStreamUsers === true ? 'anonymous' : (config.hideStreamUsers || 'false'),
                    navOrder: config.navOrder || ['home', 'discover', 'users', 'status', 'analytics', 'mediastack', 'maintenance', 'request', 'settings', 'logout'],
                    defaultLibraryIds: config.defaultLibraryIds || null,
                    use24HourClock: !!config.use24HourClock,
                    allowTemporaryAccess: !!config.allowTemporaryAccess,
                    publicStatusEnabled: config.publicStatusEnabled !== false,
                    showPosterQualityBadges: config.showPosterQualityBadges !== false,
                    autoBackupEnabled: !!config.autoBackupEnabled,
                    autoBackupIntervalDays: Number(config.autoBackupIntervalDays) > 0 ? Number(config.autoBackupIntervalDays) : 2,
                    autoBackupRetentionCount: Number(config.autoBackupRetentionCount) > 0 ? Number(config.autoBackupRetentionCount) : 10,
                    maintenanceExperimentalEnabled: !!config.maintenanceExperimentalEnabled,
                    dashboardLayout: normalizeSectionLayout(config.dashboardLayout),
                    showUsernamesInAnalytics: !!config.showUsernamesInAnalytics,
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
                    referralEnabled: false,
                    referralTrialDays: 3,
                    referralRewardDays: 7,
                    announcement: '',
                    hideStreamUsers: 'false',
                    navOrder: ['home', 'discover', 'users', 'status', 'analytics', 'mediastack', 'maintenance', 'request', 'settings', 'logout'],
                    defaultLibraryIds: null,
                    use24HourClock: false,
                    allowTemporaryAccess: false,
                    publicStatusEnabled: true,
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
            sonarrUrl, sonarrApiKey, radarrUrl, radarrApiKey, tautulliUrl, tautulliApiKey, jellystatUrl, jellystatApiKey,
            requestAppType, requestAppUrl, requestAppApiKey,
            inactiveCleanupEnabled, inactiveCleanupDays,
            primaryColor, customLogoUrl, brandingTheme, backgroundImageUrl, useScrollRevealAnimations, useCinematicLoading, useBrandedSkeleton, useTrendingSlideshow, trendingSlideshowInterval, tmdbApiKey, referralEnabled, referralTrialDays, referralRewardDays, announcement, navOrder, hideStreamUsers, defaultLibraryIds, use24HourClock, allowTemporaryAccess, showPosterQualityBadges,
            publicStatusEnabled, autoBackupEnabled, autoBackupIntervalDays, autoBackupRetentionCount, maintenanceExperimentalEnabled, dashboardLayout,
            showUsernamesInAnalytics, useTrendingSlideshowOnLogin
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
            requestUrl: requestUrl || 'https://yourdomain.com',
            contactUrl: contactUrl || '',
            contactWhatsApp: contactWhatsApp || '',
            contactEmail: contactEmail || '',
            sonarrUrl: safeSonarrUrl,
            sonarrApiKey: resolveSecret(sonarrApiKey, existingConfig.sonarrApiKey),
            radarrUrl: safeRadarrUrl,
            radarrApiKey: resolveSecret(radarrApiKey, existingConfig.radarrApiKey),
            tautulliUrl: safeTautulliUrl,
            tautulliApiKey: resolveSecret(tautulliApiKey, existingConfig.tautulliApiKey),
            jellystatUrl: safeJellystatUrl,
            jellystatApiKey: resolveSecret(jellystatApiKey, existingConfig.jellystatApiKey),
            requestAppType: ['none', 'seerr', 'overseerr', 'jellyseerr', 'ombi'].includes(String(requestAppType || '').toLowerCase()) ? (String(requestAppType).toLowerCase() === 'overseerr' ? 'seerr' : String(requestAppType).toLowerCase()) : (existingConfig.requestAppType || 'none'),
            requestAppUrl: safeRequestAppUrl,
            requestAppApiKey: resolveSecret(requestAppApiKey, existingConfig.requestAppApiKey),
            primaryColor: primaryColor || '#F7C600',
            customLogoUrl: customLogoUrl || '',
            brandingTheme: ['plex', 'slate', 'nordic'].includes(String(brandingTheme || '').toLowerCase()) ? String(brandingTheme).toLowerCase() : (existingConfig.brandingTheme || 'plex'),
            backgroundImageUrl: backgroundImageUrl || '',
            useScrollRevealAnimations: !!useScrollRevealAnimations,
            useCinematicLoading: !!useCinematicLoading,
            useBrandedSkeleton: useBrandedSkeleton !== false,
            useTrendingSlideshow: !!useTrendingSlideshow,
            trendingSlideshowInterval: parseInt(trendingSlideshowInterval, 10) || 30,
            tmdbApiKey: resolveSecret(tmdbApiKey, existingConfig.tmdbApiKey),
            referralEnabled: !!referralEnabled,
            referralTrialDays: parseInt(referralTrialDays, 10) || 3,
            referralRewardDays: parseInt(referralRewardDays, 10) || 7,
            announcement: announcement || '',
            hideStreamUsers: hideStreamUsers === true ? 'anonymous' : (hideStreamUsers === false ? 'false' : (hideStreamUsers || 'false')),
            navOrder: Array.isArray(navOrder) ? navOrder : existingConfig.navOrder || ['home', 'discover', 'users', 'status', 'analytics', 'mediastack', 'maintenance', 'request', 'settings', 'logout'],
            defaultLibraryIds: Array.isArray(defaultLibraryIds) ? defaultLibraryIds : null,
            use24HourClock: !!use24HourClock,
            allowTemporaryAccess: !!allowTemporaryAccess,
            publicStatusEnabled: publicStatusEnabled !== false,
            showPosterQualityBadges: showPosterQualityBadges !== false,
            autoBackupEnabled: !!autoBackupEnabled,
            autoBackupIntervalDays: Math.max(1, parseInt(autoBackupIntervalDays, 10) || 2),
            autoBackupRetentionCount: Math.max(1, parseInt(autoBackupRetentionCount, 10) || 10),
            maintenanceExperimentalEnabled: maintenanceExperimentalEnabled !== undefined ? !!maintenanceExperimentalEnabled : !!existingConfig.maintenanceExperimentalEnabled,
            showUsernamesInAnalytics: showUsernamesInAnalytics !== undefined ? !!showUsernamesInAnalytics : !!existingConfig.showUsernamesInAnalytics,
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
    
    let tmdbCache = { data: null, lastFetch: 0 };
    async function fetchTmdbTrendingBackgrounds(apiKey) {
        if (!apiKey) return [];
        if (tmdbCache.data && Date.now() - tmdbCache.lastFetch < 12 * 60 * 60 * 1000) {
            return tmdbCache.data;
        }
        try {
            let allResults = [];
            for (let page = 1; page <= 10; page++) {
                const res = await fetch(`https://api.themoviedb.org/3/trending/all/week?api_key=${apiKey}&page=${page}`);
                if (!res.ok) continue;
                const json = await res.json();
                if (json && json.results) {
                    allResults = allResults.concat(json.results);
                }
            }
            if (allResults.length > 0) {
                const bgs = allResults
                    .filter(i => i.backdrop_path)
                    .map(i => `https://image.tmdb.org/t/p/original${i.backdrop_path}`);
                tmdbCache.data = [...new Set(bgs)].slice(0, 100);
                tmdbCache.lastFetch = Date.now();
                return tmdbCache.data;
            }
        } catch (e) {
            log(`Failed to fetch TMDB trending: ${e.message}`);
        }
        return tmdbCache.data || [];
    }
    
    app.get('/api/config/public', async (req, res) => {
        try {
            const config = (await loadFile(CONFIG_PATH, {})) || {};
            res.json({
                mediaServerType: config.mediaServerType || 'plex',
                primaryColor: config.primaryColor || '#F7C600',
                customLogoUrl: config.customLogoUrl || '',
                brandingTheme: config.brandingTheme || 'plex',
                backgroundImageUrl: config.backgroundImageUrl || '',
                useScrollRevealAnimations: !!config.useScrollRevealAnimations,
                useCinematicLoading: !!config.useCinematicLoading,
                useBrandedSkeleton: config.useBrandedSkeleton !== false,
                useTrendingSlideshow: !!config.useTrendingSlideshow,
                useTrendingSlideshowOnLogin: config.useTrendingSlideshowOnLogin !== false,
                trendingSlideshowInterval: parseInt(config.trendingSlideshowInterval, 10) || 30,
                trendingBackgrounds: (!!config.useTrendingSlideshow || config.useTrendingSlideshowOnLogin !== false) ? await fetchTmdbTrendingBackgrounds(config.tmdbApiKey) : [],
                announcement: config.announcement || '',
                referralEnabled: !!config.referralEnabled,
                appVersion: appVersion,
                use24HourClock: !!config.use24HourClock,
                allowTemporaryAccess: !!config.allowTemporaryAccess,
                publicStatusEnabled: config.publicStatusEnabled !== false,
                showPosterQualityBadges: config.showPosterQualityBadges !== false,
                dashboardLayout: normalizeSectionLayout(config.dashboardLayout),
                basePath: BASE_PATH,
            });
        } catch (error) {
            res.json({
                mediaServerType: 'plex',
                primaryColor: '#F7C600',
                customLogoUrl: '',
                brandingTheme: 'plex',
                backgroundImageUrl: '',
                useScrollRevealAnimations: false,
                useCinematicLoading: false,
                useBrandedSkeleton: true,
                useTrendingSlideshow: false,
                trendingSlideshowInterval: 30,
                trendingBackgrounds: [],
                announcement: '',
                referralEnabled: false,
                appVersion: appVersion,
                use24HourClock: false,
                allowTemporaryAccess: false,
                publicStatusEnabled: true,
                showPosterQualityBadges: true,
                dashboardLayout: DEFAULT_DASHBOARD_LAYOUT,
                basePath: BASE_PATH,
            });
        }
    });
    
    app.post('/api/config/logo', requireAdmin, express.raw({ type: 'image/*', limit: '5mb' }), async (req, res) => {
        try {
            const buf = req.body;
            if (!Buffer.isBuffer(buf) || buf.length < 4) {
                return res.status(400).json({ error: 'Invalid image file.' });
            }
            // Verify PNG (89 50 4E 47) or JPEG (FF D8 FF) magic bytes — Content-Type header alone is spoofable
            const isPng  = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47;
            const isJpeg = buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF;
            if (!isPng && !isJpeg) {
                return res.status(400).json({ error: 'Invalid image format. Only PNG and JPEG files are accepted.' });
            }
            const logoDir = path.join(process.cwd(), 'static');
            await fs.mkdir(logoDir, { recursive: true });
            const logoPath = path.join(logoDir, 'logo.png');
            await fs.writeFile(logoPath, buf);
            res.json({ message: 'Logo uploaded successfully.' });
        } catch (e) {
            log('Failed to upload logo: ' + e.message);
            res.status(500).json({ error: 'Failed to upload logo.' });
        }
    });
    
    app.post('/api/config/test-email', requireAdmin, async (req, res) => {
        const { smtpHost, smtpPort, smtpUser, smtpPass, smtpFrom, smtpSecure, testRecipient } = req.body;
    
        if (!smtpHost || !smtpUser || !smtpPass || !testRecipient) {
            return res.status(400).json({ error: 'Host, user, password, and test recipient are required.' });
        }
    
        // The UI shows the stored password as SECRET_MASK; resolve it back to the
        // real stored value so the test uses actual credentials.
        let effectiveSmtpPass = smtpPass;
        if (smtpPass === SECRET_MASK) {
            const storedConfig = await loadFile(CONFIG_PATH, {});
            effectiveSmtpPass = storedConfig.smtpPass || '';
        }
    
        const config = {
            smtpHost,
            smtpPort: parseInt(smtpPort, 10) || 587,
            smtpUser,
            smtpPass: effectiveSmtpPass,
            smtpFrom,
            smtpSecure: !!smtpSecure,
        };
    
        // Check if logo exists to determine if we should reference it in HTML
        const logoPath = path.join(process.cwd(), 'static', 'logo.png');
        let hasLogo = false;
        try {
            await fs.access(logoPath);
            hasLogo = true;
        } catch (e) { }
    
        try {
            log(`Sending test email to ${testRecipient}...`);
            await sendEmail(
                config,
                testRecipient,
                '[Plex Server] Test Email Connection',
                `
                <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f6f9; padding: 30px; color: #333333; line-height: 1.6;">
                    <div style="max-width: 600px; margin: auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.05); border-top: 6px solid #e5a00d;">
                        <div style="background-color: #282A2D; padding: 25px; text-align: center;">
                            ${hasLogo ? '<img src="cid:logo" alt="Logo" style="max-height: 100px; display: block; margin: 0 auto 10px auto;" />' : ''}
                            <h1 style="color: #ffffff; margin: 0; font-size: 26px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase;">PLEX SERVER</h1>
                        </div>
                        <div style="padding: 30px 40px;">
                            <h2 style="color: #282A2D; font-size: 20px; margin-top: 0; font-weight: 600; text-align: center;">SMTP Test Successful</h2>
                            <p>This is a test notification confirming that the Plex SMTP server parameters are active and communicating successfully.</p>
                            <p>Automated expiry notifications will use this template design to contact shared members before access revocation.</p>
                        </div>
                        <div style="background-color: #f7fafc; padding: 20px 30px; border-top: 1px solid #edf2f7; text-align: center; font-size: 12px; color: #a0aec0;">
                            <p style="margin: 0;">Automated alert from the Plex Expiry Service.</p>
                        </div>
                    </div>
                </div>
                `
            );
            res.json({ message: 'Test email sent successfully!' });
        } catch (error) {
            log(`Failed to send test email: ${error.message}`);
            res.status(500).json({ error: `SMTP test failed: ${error.message}` });
        }
    });
    
    const resolveTestCredential = (incoming, existing) => {
        if (incoming === undefined || incoming === null || incoming === '') return existing || '';
        if (incoming === SECRET_MASK) return existing || '';
        return String(incoming);
    };
    
    const resolveIntegrationUrlForTest = (incoming, existing) => {
        const url = resolveTestCredential(incoming, existing);
        if (!url) return '';
        const trimmedIncoming = typeof incoming === 'string' ? incoming.trim() : '';
        const trimmedExisting = typeof existing === 'string' ? existing.trim() : '';
        if (trimmedIncoming !== '' && trimmedIncoming !== trimmedExisting) {
            return sanitizeIntegrationUrl(trimmedIncoming);
        }
        return resolveIntegrationUrlForFetch(url);
    };
    
    const isSeerrFamilyRequestApp = (type) => {
        const lower = String(type || '').toLowerCase();
        return lower === 'seerr' || lower === 'overseerr' || lower === 'jellyseerr';
    };
    
    const testSeerrFamilyConnection = async (baseUrl, apiKey) => {
        const headers = { Accept: 'application/json', 'X-Api-Key': apiKey };
        const statusRes = await fetchWithTimeout(`${baseUrl}/api/v1/status`, { headers }, 12000);
        if (!statusRes.ok) throw new Error(`Seerr returned HTTP ${statusRes.status} at /api/v1/status`);
        const data = await statusRes.json().catch(() => ({}));
        const authRes = await fetchWithTimeout(`${baseUrl}/api/v1/request/count`, { headers }, 12000);
        if (!authRes.ok) throw new Error(`Seerr API key rejected (HTTP ${authRes.status})`);
        const version = data.version || data.commitTag || '?';
        return { version, message: `Seerr v${version} connected` };
    };
    
    const assertIntegrationTestAccess = async (req, res) => {
        const stored = await loadFile(CONFIG_PATH, {});
        const isConfigured = isPortalConfigured(stored);
        if (isConfigured) {
            const sessionToken = req.cookies && req.cookies.session;
            if (!sessionToken) {
                res.status(403).json({ error: 'Forbidden: admin login required.' });
                return false;
            }
            try {
                const decoded = jwt.verify(sessionToken, JWT_SECRET);
                const isAdmin = await resolveCurrentAdmin(decoded, stored);
                if (!isAdmin) {
                    res.status(403).json({ error: 'Forbidden: admins only.' });
                    return false;
                }
                req.user = decoded;
            } catch (e) {
                res.status(403).json({ error: 'Forbidden: invalid session.' });
                return false;
            }
        }
        return true;
    };
    
    app.post('/api/config/test-integration', setupRateLimit, async (req, res) => {
        if (!(await assertIntegrationTestAccess(req, res))) return;
    
        const {
            type,
            token, serverIdentifier, plexServerUrl,
            jellyfinUrl, jellyfinApiKey,
            sonarrUrl, sonarrApiKey,
            radarrUrl, radarrApiKey,
            tautulliUrl, tautulliApiKey,
            jellystatUrl, jellystatApiKey,
            requestAppType, requestAppUrl, requestAppApiKey,
        } = req.body || {};
    
        const stored = await loadFile(CONFIG_PATH, {});
    
        try {
            if (type === 'plex') {
                const plexToken = resolveTestCredential(token, stored.plexToken);
                const serverId = resolveTestCredential(serverIdentifier, stored.serverIdentifier);
                if (!plexToken || !serverId) return res.status(400).json({ error: 'Plex token and server identifier are required.' });
                invalidatePlexConnectionCaches();
                const directUrl = resolveTestCredential(plexServerUrl, stored.plexServerUrl);
                const testConfig = { ...stored, plexToken, serverIdentifier: serverId, ...(directUrl ? { plexServerUrl: directUrl } : {}) };
                const uri = await getPlexConnectionUri(testConfig);
                const identityRes = await fetchWithTimeout(`${uri}/identity?X-Plex-Token=${encodeURIComponent(plexToken)}`, {
                    headers: { Accept: 'application/json' },
                }, 12000);
                if (!identityRes.ok) throw new Error(`Plex server returned HTTP ${identityRes.status}`);
                const identity = await identityRes.json().catch(() => ({}));
                const container = identity.MediaContainer || identity;
                const version = container.version || container.Version || '';
                const message = version
                    ? `Connected to Plex Media Server (v${version})`
                    : 'Connected to Plex Media Server';
                return res.json({ ok: true, message, details: { version: version || null, machineIdentifier: container.machineIdentifier || serverId, uri } });
            }
    
            if (type === 'jellyfin') {
                const url = resolveIntegrationUrlForFetch(resolveTestCredential(jellyfinUrl, stored.jellyfinUrl));
                const apiKey = resolveTestCredential(jellyfinApiKey, stored.jellyfinApiKey);
                if (!url || !apiKey) return res.status(400).json({ error: 'Jellyfin URL and API key are required.' });
                const infoRes = await fetchWithTimeout(`${url}/System/Info`, {
                    headers: { Accept: 'application/json', 'X-Emby-Token': apiKey },
                }, 12000);
                if (!infoRes.ok) throw new Error(`Jellyfin returned HTTP ${infoRes.status}`);
                const data = await infoRes.json().catch(() => ({}));
                const version = data.Version || data.version || '?';
                return res.json({ ok: true, message: `Jellyfin v${version} connected`, details: { version, serverName: data.ServerName || data.LocalAddress || null } });
            }
    
            if (type === 'sonarr') {
                const url = resolveIntegrationUrlForTest(sonarrUrl, stored.sonarrUrl);
                const apiKey = resolveTestCredential(sonarrApiKey, stored.sonarrApiKey);
                if (!url || !apiKey) return res.status(400).json({ error: 'Sonarr URL and API key are required.' });
                const statusRes = await fetchWithTimeout(`${url}/api/v3/system/status`, {
                    headers: { 'X-Api-Key': apiKey, Accept: 'application/json' },
                }, 12000);
                if (!statusRes.ok) throw new Error(`Sonarr returned HTTP ${statusRes.status}`);
                const data = await statusRes.json();
                return res.json({ ok: true, message: `Sonarr v${data.version || '?'} connected`, details: { version: data.version, appName: data.appName } });
            }
    
            if (type === 'radarr') {
                const url = resolveIntegrationUrlForTest(radarrUrl, stored.radarrUrl);
                const apiKey = resolveTestCredential(radarrApiKey, stored.radarrApiKey);
                if (!url || !apiKey) return res.status(400).json({ error: 'Radarr URL and API key are required.' });
                const statusRes = await fetchWithTimeout(`${url}/api/v3/system/status`, {
                    headers: { 'X-Api-Key': apiKey, Accept: 'application/json' },
                }, 12000);
                if (!statusRes.ok) throw new Error(`Radarr returned HTTP ${statusRes.status}`);
                const data = await statusRes.json();
                return res.json({ ok: true, message: `Radarr v${data.version || '?'} connected`, details: { version: data.version, appName: data.appName } });
            }
    
            if (type === 'tautulli') {
                const url = resolveIntegrationUrlForTest(tautulliUrl, stored.tautulliUrl);
                const apiKey = resolveTestCredential(tautulliApiKey, stored.tautulliApiKey);
                if (!url || !apiKey) return res.status(400).json({ error: 'Tautulli URL and API key are required.' });
                const infoRes = await fetchWithTimeout(`${url}/api/v2?apikey=${encodeURIComponent(apiKey)}&cmd=get_server_info`, {
                    headers: { Accept: 'application/json' },
                }, 12000);
                if (!infoRes.ok) throw new Error(`Tautulli returned HTTP ${infoRes.status}`);
                const payload = await infoRes.json();
                if (payload?.response?.result !== 'success') throw new Error(payload?.response?.message || 'Tautulli API error');
                const info = payload.response.data || {};
                return res.json({ ok: true, message: `Tautulli connected (${info.pms_name || 'Plex'})`, details: { pmsVersion: info.pms_version, pmsPlatform: info.pms_platform } });
            }
    
            if (type === 'jellystat') {
                const url = resolveIntegrationUrlForFetch(resolveTestCredential(jellystatUrl, stored.jellystatUrl));
                const apiKey = resolveTestCredential(jellystatApiKey, stored.jellystatApiKey);
                if (!url || !apiKey) return res.status(400).json({ error: 'Jellystat URL and API key are required.' });
                const statsRes = await fetchWithTimeout(`${url}/stats/getViewsByLibraryType?days=30`, {
                    headers: { Accept: 'application/json', 'X-API-Token': apiKey },
                }, 12000);
                if (!statsRes.ok) throw new Error(`Jellystat returned HTTP ${statsRes.status}`);
                const data = await statsRes.json().catch(() => null);
                return res.json({ ok: true, message: 'Jellystat connected', details: { sample: data ? true : false } });
            }
    
            if (type === 'requestApp') {
                const appType = String(resolveTestCredential(requestAppType, stored.requestAppType) || 'none').toLowerCase();
                const baseUrl = resolveIntegrationUrlForTest(requestAppUrl, stored.requestAppUrl);
                const apiKey = resolveTestCredential(requestAppApiKey, stored.requestAppApiKey);
                if (appType === 'none') return res.status(400).json({ error: 'Request app type must be selected.' });
                if (!baseUrl || !apiKey) return res.status(400).json({ error: 'Request app URL and API key are required.' });
                if (isSeerrFamilyRequestApp(appType)) {
                    const result = await testSeerrFamilyConnection(baseUrl, apiKey);
                    return res.json({ ok: true, message: result.message, details: { version: result.version } });
                }
                if (appType === 'ombi') {
                    const headers = { Accept: 'application/json', 'X-Api-Key': apiKey };
                    const aboutRes = await fetchWithTimeout(`${baseUrl}/api/v1/Settings/about`, { headers }, 12000);
                    if (!aboutRes.ok) throw new Error(`Ombi returned HTTP ${aboutRes.status}`);
                    const data = await aboutRes.json().catch(() => ({}));
                    return res.json({ ok: true, message: `Ombi v${data.version || data.applicationVersion || '?'} connected`, details: { version: data.version || data.applicationVersion } });
                }
                return res.status(400).json({ error: 'Unsupported request app type.' });
            }
    
            return res.status(400).json({ error: 'Unknown integration type.' });
        } catch (e) {
            log(`Integration test failed (${type}): ${e.message}`);
            res.status(500).json({ error: e.message || 'Connection test failed.' });
        }
    });
};
