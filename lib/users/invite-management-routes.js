import { randomBytes } from 'crypto';
import {
    buildInviteEmailHtml,
    buildInviteEmailSubject,
    hasInviteLogo,
} from './invite-email.js';
import { isSmtpAdminOnly, isSmtpReady } from '../comms/smtp-ready.js';

export const registerInviteManagementRoutes = ({
    app,
    requireAdmin,
    publicReadRateLimit,
    configPath,
    invitesPath,
    loadFile,
    saveFile,
    sendEmail,
    getAdminProfile,
    log,
}) => {
    const CONFIG_PATH = configPath;
    const INVITES_PATH = invitesPath;

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
        if (!isSmtpReady(config)) {
            return res.status(400).json({ error: 'Email is disabled or SMTP is not configured. Cannot send email.' });
        }
        if (isSmtpAdminOnly(config)) {
            return res.status(400).json({ error: 'Email is limited to admins. Turn off Admins only to send member invites.' });
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
};
