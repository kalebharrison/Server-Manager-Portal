import fs from 'fs/promises';
import path from 'path';
import { randomBytes, randomUUID } from 'crypto';
import fetch from 'node-fetch';
import jwt from 'jsonwebtoken';

export const resolvePlexDiscoveryToken = (incomingToken, storedToken, secretMask, normalizePlexToken) => (
    normalizePlexToken(incomingToken === secretMask ? storedToken : incomingToken)
);

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
    log,
}) => {
    const CONFIG_PATH = configPath;
    const USERS_PATH = usersPath;
    const INVITES_PATH = invitesPath;
    const JWT_SECRET = jwtSecret;
    const SECRET_MASK = secretMask;
    const UNCONFIGURED_SETUP_ACCESS_DENIED = 'Initial setup access denied. Use localhost, configure SETUP_TOKEN, or provide a valid Plex server owner token.';

    const verifyPlexOwnerTokenForSetup = async (plexToken, plexServerUrl = '') => {
        const token = normalizePlexToken(plexToken);
        if (!token) return false;
        try {
            const servers = await fetchOwnedPlexServers(token);
            if (servers.length > 0) return true;
        } catch (e) {
            log(`Plex owner token verification via Plex.tv failed: ${e.message}`);
        }
        const directUrl = String(plexServerUrl || '').trim();
        return directUrl ? validatePlexServerAdminToken(token, directUrl) : false;
    };

    app.post('/api/plex/servers', setupRateLimit, async (req, res) => {
        const { token, plexServerUrl } = req.body;
    
        try {
            const existingConfig = await loadFile(CONFIG_PATH, {});
            const isConfigured = isPortalConfigured(existingConfig);
            if (isConfigured) {
                const sessionToken = req.cookies && req.cookies.session;
                if (!sessionToken) {
                    return res.status(403).json({ error: 'Forbidden: Admin session required.' });
                }
                let decoded;
                try {
                    decoded = jwt.verify(sessionToken, JWT_SECRET);
                } catch (e) {
                    return res.status(403).json({ error: 'Forbidden: Invalid admin session.' });
                }
                const isAdmin = await resolveCurrentAdmin(decoded, existingConfig);
                if (!isAdmin) {
                    return res.status(403).json({ error: 'Forbidden: Admins only.' });
                }
            }
            const normalizedToken = resolvePlexDiscoveryToken(token, existingConfig.plexToken, SECRET_MASK, normalizePlexToken);
            if (!normalizedToken) return res.status(400).json({ error: 'Plex token is required.' });
            if (!isConfigured && !canRunInitialSetup(req) && !(await verifyPlexOwnerTokenForSetup(normalizedToken, plexServerUrl || resolveConfiguredPlexServerUrl(existingConfig)))) {
                return res.status(403).json({ error: UNCONFIGURED_SETUP_ACCESS_DENIED });
            }
    
            log('Fetching Plex servers using /pms/servers XML API...');
            let servers = [];
            try {
                servers = await fetchOwnedPlexServers(normalizedToken);
            } catch (e) {
                log(`Owned Plex server discovery failed: ${e.message}`);
            }
    
            const directUrl = String(plexServerUrl || '').trim() || resolveConfiguredPlexServerUrl(existingConfig);
            if (servers.length === 0 && directUrl) {
                try {
                    const baseUrl = resolveIntegrationUrlForFetch(directUrl);
                    const identityRes = await fetchWithTimeout(`${baseUrl}/identity`, {
                        headers: { 'X-Plex-Token': normalizedToken, Accept: 'application/json' },
                    }, 6000);
                    if (identityRes.ok) {
                        const identityText = await identityRes.text();
                        let machineIdentifier = '';
                        let friendlyName = '';
                        try {
                            const parsed = JSON.parse(identityText);
                            const container = parsed?.MediaContainer || parsed || {};
                            machineIdentifier = String(container.machineIdentifier || '');
                            friendlyName = String(container.friendlyName || container.name || 'Plex Server');
                        } catch {
                            const machineMatch = identityText.match(/machineIdentifier="([^"]+)"/i)
                                || identityText.match(/<machineIdentifier>([^<]+)<\/machineIdentifier>/i);
                            machineIdentifier = machineMatch ? String(machineMatch[1]) : '';
                            const nameMatch = identityText.match(/friendlyName="([^"]+)"/i)
                                || identityText.match(/<friendlyName>([^<]+)<\/friendlyName>/i);
                            friendlyName = nameMatch ? String(nameMatch[1]) : 'Plex Server';
                        }
                        if (machineIdentifier) {
                            servers = [{ name: friendlyName || 'Plex Server', identifier: machineIdentifier }];
                        }
                    }
                } catch (e) {
                    log(`Direct Plex URL identity fallback failed: ${e.message}`);
                }
            }
    
            if (servers.length === 0) {
                log('No owned servers found via Plex.tv or direct URL.');
            } else {
                log(`Found ${servers.length} server(s).`);
            }
    
            res.json(servers);
        } catch (error) {
            log(`An exception occurred in /api/plex/servers: ${error.message}`);
            res.status(500).json({ error: error.message || 'An unexpected error occurred while fetching servers.' });
        }
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
    
            const logoPath = path.join(process.cwd(), 'static', 'logo.png');
            let hasLogo = false;
            try { await fs.access(logoPath); hasLogo = true; } catch (e) { }
    
            const subject = `You've been invited to ${serverName}!`;
            const html = `
                <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f6f9; padding: 30px; color: #333333; line-height: 1.6;">
                    <div style="max-width: 600px; margin: auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.05); border-top: 6px solid #e5a00d;">
                        <div style="background-color: #282A2D; padding: 25px; text-align: center;">
                            ${hasLogo ? '<img src="cid:logo" alt="Logo" style="max-height: 100px; display: block; margin: 0 auto 10px auto;" />' : ''}
                            <h1 style="color: #ffffff; margin: 0; font-size: 26px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase;">${serverName}</h1>
                        </div>
                        <div style="padding: 30px 40px;">
                            <h2 style="color: #e5a00d; font-size: 20px; margin-top: 0; font-weight: 600; text-align: center;">Welcome to the Server!</h2>
                            <p style="text-align: center; font-size: 16px;">You have been invited to join our private media server.</p>
                            
                            <div style="text-align: center; margin: 35px 0;">
                                <a href="${inviteUrl}" style="background-color: #e5a00d; color: #ffffff; text-decoration: none; padding: 14px 35px; font-weight: bold; border-radius: 6px; display: inline-block; font-size: 16px; box-shadow: 0 4px 6px rgba(229, 160, 13, 0.2);">Claim Your Access</a>
                            </div>
                            
                            <div style="background-color: #fcf8f2; border-left: 4px solid #e5a00d; padding: 20px; margin: 25px 0 0 0; border-radius: 6px;">
                                <p style="margin: 0; font-size: 14px; color: #718096; text-align: center;">This invite link is for single use only. It will grant you access for <strong>${newInvite.durationDays} days</strong>.</p>
                            </div>
                        </div>
                        <div style="background-color: #f7fafc; padding: 20px 30px; border-top: 1px solid #edf2f7; text-align: center; font-size: 12px; color: #a0aec0;">
                            <p style="margin: 0 0 5px 0;">Automated notification from the Server Manager Portal.</p>
                            <p style="margin: 0;">We hope you enjoy the server!</p>
                        </div>
                    </div>
                </div>
            `;
    
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
    
        const invite = invites[inviteIndex];
        if (invite.maxUses !== 'unlimited' && invite.currentUses >= invite.maxUses) {
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
            const users = await loadFile(USERS_PATH, []);
    
            // Check if user already exists
            if (users.find(u => String(u.plexId) === String(plexUser.id) || u.email === plexUser.email)) {
                return res.status(400).json({ error: 'You are already a member of this server.' });
            }
    
            // Calculate expiry date
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            today.setDate(today.getDate() + invite.durationDays);
            const expiryDate = today.toISOString();
    
            const newUser = {
                id: randomUUID(),
                plexId: plexUser.id,
                username: plexUser.username,
                email: plexUser.email,
                thumb: plexUser.thumb,
                expiryDate: expiryDate,
                joiningDate: new Date().toISOString(),
                plexAccessStatus: 'pending',
                isTrial: false
            };
    
            users.push(newUser);
            await saveFile(USERS_PATH, users);
    
            // Send actual Plex invite
            await inviteUserToPlex(newUser, config, invite.libraryIds).catch(e => log('Failed to invite claimed user: ' + e.message));
    
            // Update invite usage
            // Re-read to prevent race condition during long Plex API calls
            let freshInvites = await loadFile(INVITES_PATH, []);
            const freshIndex = freshInvites.findIndex(i => i.code === req.params.code);
            if (freshIndex !== -1) {
                freshInvites[freshIndex].currentUses = (freshInvites[freshIndex].currentUses || 0) + 1;
                if (!freshInvites[freshIndex].usedBy) freshInvites[freshIndex].usedBy = [];
                freshInvites[freshIndex].usedBy.push({
                    username: plexUser.username,
                    email: plexUser.email,
                    date: new Date().toISOString()
                });
                await saveFile(INVITES_PATH, freshInvites);
            }
    
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
            log(`Error claiming invite: ${e.message}`);
            res.status(500).json({ error: 'Failed to claim invite. Please try again later.' });
        }
    });
};
