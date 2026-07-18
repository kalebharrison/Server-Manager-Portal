import jwt from 'jsonwebtoken';
import { signSessionJwt } from '../auth/jwt-session.js';
import { updateFile as updateJsonFile } from '../core/json-file-store.js';
import {
    InviteClaimError,
    executeInviteClaimTransaction,
} from './invite-claim.js';

export const registerInviteClaimRoute = ({
    app,
    authRateLimit,
    configPath,
    usersPath,
    invitesPath,
    jwtSecret,
    loadFile,
    updateFile = updateJsonFile,
    getClientId,
    inviteUserToPlex,
    membershipSync = null,
    appendAuditLog,
    getAdminId,
    setSessionCookie,
    log,
}) => {
    const CONFIG_PATH = configPath;
    const USERS_PATH = usersPath;
    const INVITES_PATH = invitesPath;
    const JWT_SECRET = jwtSecret;

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

            const adminId = await getAdminId(config);
            const isAdmin = !!(adminId && String(plexUser.id) === String(adminId));
            const sessionUser = {
                id: plexUser.uuid || plexUser.id,
                plexId: plexUser.id,
                email: plexUser.email,
                username: plexUser.username,
                isAdmin
            };
            const token = signSessionJwt(jwt, sessionUser, JWT_SECRET, { expiresIn: '7d' });
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
