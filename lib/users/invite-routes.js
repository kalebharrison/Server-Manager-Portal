import { randomBytes } from 'crypto';
import jwt from 'jsonwebtoken';
import { updateFile as updateJsonFile } from '../core/json-file-store.js';
import {
    InviteClaimError,
    executeInviteClaimTransaction,
    recordInviteClaim,
} from './invite-claim.js';
import {
    registerInvitePlexDiscoveryRoutes,
    resolvePlexDiscoveryToken,
} from './invite-plex-discovery-routes.js';
import {
    buildInviteEmailHtml,
    buildInviteEmailSubject,
    hasInviteLogo,
} from './invite-email.js';

export { resolvePlexDiscoveryToken };
export { InviteClaimError, recordInviteClaim };

export const registerInviteRoutes = ({
    app,
    requireAdmin,
    authRateLimit,
    publicReadRateLimit,
    setupRateLimit,
    configPath,
    usersPath,
    invitesPath,
    jwtSecret,
    secretMask,
    loadFile,
    saveFile,
    updateFile = updateJsonFile,
    normalizePlexToken,
    isPortalConfigured,
    resolveCurrentAdmin,
    fetchOwnedPlexServers,
    validatePlexServerAdminToken,
    canRunInitialSetup,
    resolveConfiguredPlexServerUrl,
    resolveIntegrationUrlForFetch,
    fetchWithTimeout,
    syncUsers,
    syncJellyfinUsers,
    appendAuditLog,
    sendEmail,
    getAdminProfile,
    getClientId,
    inviteUserToPlex,
    getAdminId,
    setSessionCookie,
    membershipSync = null,
    log,
}) => {
    const CONFIG_PATH = configPath;
    const USERS_PATH = usersPath;
    const INVITES_PATH = invitesPath;
    const JWT_SECRET = jwtSecret;

    registerInvitePlexDiscoveryRoutes({
        app,
        setupRateLimit,
        configPath: CONFIG_PATH,
        jwtSecret: JWT_SECRET,
        secretMask,
        loadFile,
        normalizePlexToken,
        isPortalConfigured,
        resolveCurrentAdmin,
        fetchOwnedPlexServers,
        validatePlexServerAdminToken,
        canRunInitialSetup,
        resolveConfiguredPlexServerUrl,
        resolveIntegrationUrlForFetch,
        fetchWithTimeout,
        log,
    });

    app.post('/api/sync', requireAdmin, async (req, res) => {
        const config = await loadFile(CONFIG_PATH, null);
        if (!config) return res.status(400).json({ error: 'App not configured.' });
        const isJellyfinPortal = String(config.mediaServerType || '').toLowerCase() === 'jellyfin';
        try {
            const result = isJellyfinPortal ? await syncJellyfinUsers(config) : await syncUsers(config);
            await appendAuditLog(isJellyfinPortal ? 'jellyfin_sync_completed' : 'plex_sync_completed', req.user || null, null, { count: result.count });
            res.json(result);
        } catch (error) {
            await appendAuditLog(isJellyfinPortal ? 'jellyfin_sync_failed' : 'plex_sync_failed', req.user || null, null, { error: error.message });
            res.status(500).json({ error: error.message });
        }
    });

    // --- Invites Endpoints ---
    app.get('/api/invites', requireAdmin, async (req, res) => {
        const invites = await loadFile(INVITES_PATH, []);
        res.json(invites);
    });

    app.post('/api/invites', requireAdmin, async (req, res) => {
        const { durationDays, maxUses, libraryIds } = req.body;
        const invites = await loadFile(INVITES_PATH, []);

        const code = randomBytes(6).toString('hex');
        const newInvite = {
            code,
            durationDays: parseInt(durationDays, 10) || 30,
            maxUses: maxUses === 'unlimited' ? 'unlimited' : (parseInt(maxUses, 10) || 1),
            currentUses: 0,
            libraryIds: Array.isArray(libraryIds) && libraryIds.length > 0 ? libraryIds : null,
            createdBy: req.user.username || 'admin',
            createdAt: new Date().toISOString()
        };

        invites.push(newInvite);
        await saveFile(INVITES_PATH, invites);
        res.json(newInvite);
    });

    app.post('/api/invites/email', requireAdmin, async (req, res) => {
        const { email, durationDays, libraryIds } = req.body;
        if (!email) return res.status(400).json({ error: 'Email is required' });

        const config = await loadFile(CONFIG_PATH, {});
        if (!config.smtpHost || !config.smtpUser) {
            return res.status(400).json({ error: 'SMTP settings are not configured. Cannot send email.' });
        }

        const invites = await loadFile(INVITES_PATH, []);
        const code = randomBytes(6).toString('hex');
        const newInvite = {
            code,
            durationDays: parseInt(durationDays, 10) || 30,
            maxUses: 1,
            currentUses: 0,
            libraryIds: Array.isArray(libraryIds) && libraryIds.length > 0 ? libraryIds : null,
            createdBy: req.user.username || 'admin',
            createdAt: new Date().toISOString(),
            sentTo: email
        };

        try {
            const publicDomain = config.publicDomain || 'https://portal.yourdomain.com';
            const inviteUrl = `${publicDomain}/invite/${code}`;
            const adminProfile = await getAdminProfile(config);
            const serverName = adminProfile ? adminProfile.serverName : 'Our Plex Server';
            const hasLogo = await hasInviteLogo();

            const subject = buildInviteEmailSubject(serverName);
            const html = buildInviteEmailHtml({
                serverName,
                inviteUrl,
                durationDays: newInvite.durationDays,
                hasLogo,
            });

            await sendEmail(config, email, subject, html);
            invites.push(newInvite);
            await saveFile(INVITES_PATH, invites);
            res.json({ message: 'Invite sent successfully', invite: newInvite });
        } catch (err) {
            log('Failed to send email invite: ' + err.message);
            res.status(500).json({ error: 'Failed to send email. Please check your SMTP settings.' });
        }
    });

    app.delete('/api/invites/:code', requireAdmin, async (req, res) => {
        let invites = await loadFile(INVITES_PATH, []);
        invites = invites.filter(i => i.code !== req.params.code);
        await saveFile(INVITES_PATH, invites);
        res.json({ success: true });
    });

    app.get('/api/invites/:code/info', publicReadRateLimit, async (req, res) => {
        const invites = await loadFile(INVITES_PATH, []);
        const invite = invites.find(i => i.code === req.params.code);
        if (!invite) return res.status(404).json({ error: 'Invite code not found or revoked.' });
        if (invite.maxUses !== 'unlimited' && invite.currentUses >= invite.maxUses) {
            return res.status(400).json({ error: 'Invite code has reached its maximum usage limit.' });
        }
        const config = await loadFile(CONFIG_PATH, {});
        const adminProfile = await getAdminProfile(config);
        res.json({
            durationDays: invite.durationDays,
            serverName: adminProfile.serverName || 'Our Server',
            customLogoUrl: config.customLogoUrl,
            thumb: adminProfile.thumb
        });
    });

    app.post('/api/invites/:code/claim', authRateLimit, async (req, res) => {
        const { pinId } = req.body;
        if (!pinId) return res.status(400).json({ error: 'PIN ID is required' });

        let invites = await loadFile(INVITES_PATH, []);
        const inviteIndex = invites.findIndex(i => i.code === req.params.code);
        if (inviteIndex === -1) return res.status(404).json({ error: 'Invite code not found or revoked.' });

        const initialInvite = invites[inviteIndex];
        if (initialInvite.maxUses !== 'unlimited' && initialInvite.currentUses >= initialInvite.maxUses) {
            return res.status(400).json({ error: 'Invite code has reached its maximum usage limit.' });
        }

        try {
            const pinRes = await fetch(`https://plex.tv/api/v2/pins/${pinId}`, {
                headers: {
                    'Accept': 'application/json',
                    'X-Plex-Client-Identifier': getClientId()
                }
            });
            const pinData = await pinRes.json();

            if (!pinData.authToken) {
                return res.status(400).json({ error: 'Not authenticated with Plex yet. Please try again.' });
            }

            const config = await loadFile(CONFIG_PATH, {});
            // Validate user with Plex
            const plexRes = await fetch('https://plex.tv/api/v2/user', {
                headers: {
                    'X-Plex-Token': pinData.authToken,
                    'Accept': 'application/json'
                }
            });
            if (!plexRes.ok) return res.status(401).json({ error: 'Invalid Plex token' });

            const plexUser = await plexRes.json();
            const { invite, newUser } = await executeInviteClaimTransaction({
                code: req.params.code,
                plexUser,
                config,
                invitesPath: INVITES_PATH,
                usersPath: USERS_PATH,
                updateFile,
                inviteUserToPlex,
                membershipSync,
                log,
            });

            await appendAuditLog('invite_claimed', { username: plexUser.username, id: plexUser.id }, newUser, { code: invite.code });

            // Log user in
            const adminId = await getAdminId(config);
            const isAdmin = !!(adminId && String(plexUser.id) === String(adminId));
            const sessionUser = {
                id: plexUser.uuid || plexUser.id,
                plexId: plexUser.id,
                email: plexUser.email,
                username: plexUser.username,
                isAdmin
            };
            const token = jwt.sign(sessionUser, JWT_SECRET, { expiresIn: '7d' });
            setSessionCookie(req, res, token);

            res.json({ success: true, user: newUser });
        } catch (e) {
            if (e instanceof InviteClaimError) {
                return res.status(e.statusCode).json({ error: e.message });
            }
            log(`Error claiming invite: ${e.message}`);
            res.status(500).json({ error: 'Failed to claim invite. Please try again later.' });
        }
    });
};
