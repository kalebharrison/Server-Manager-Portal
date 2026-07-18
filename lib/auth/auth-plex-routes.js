import jwt from 'jsonwebtoken';

import { addDays } from '../core/date-utils.js';
import { isDeletedUser } from '../users/deleted-users.js';

export const registerPlexAuthRoutes = ({
    app,
    authRateLimit,
    authCallbackRateLimit,
    setupRateLimit,
    configPath,
    usersPath,
    deletedUsersPath,
    jwtSecret,
    forceSecureCookies,
    loadFile,
    saveFile,
    apiFetch,
    getClientId,
    withBasePath,
    clearSessionCookie,
    setSessionCookie,
    appendAuditLog,
    findLocalUserForSession,
    syncAdminPlexIdFromConfigToken,
    getAdminId,
    isPortalConfigured,
    canRunInitialSetup,
    inviteUserToPlex,
    fetchOwnedPlexServers,
    isEligibleMember,
    membershipSync = null,
    log,
    fetchImpl = fetch,
}) => {
    const CONFIG_PATH = configPath;
    const USERS_PATH = usersPath;
    const DELETED_USERS_PATH = deletedUsersPath;
    const JWT_SECRET = jwtSecret;
    const FORCE_SECURE_COOKIES = forceSecureCookies;

    const fetchPlexPinAuthToken = async (pinId, { attempts = 10, delayMs = 800 } = {}) => {
        let lastData = null;
        for (let attempt = 1; attempt <= attempts; attempt++) {
            const pinRes = await fetchImpl(`https://plex.tv/api/v2/pins/${pinId}`, {
                headers: {
                    Accept: 'application/json',
                    'X-Plex-Client-Identifier': getClientId(),
                },
            });
            lastData = await pinRes.json();
            if (lastData?.authToken) {
                if (attempt > 1) log(`Plex pin ${pinId} authenticated after ${attempt} attempts`);
                return lastData;
            }
            if (attempt < attempts) {
                await new Promise((resolve) => setTimeout(resolve, delayMs));
            }
        }
        log(`Plex pin ${pinId} missing authToken after ${attempts} attempts`);
        return lastData || {};
    };

    const handlePlexPinLogin = async (req, res, pinId, ref, { redirectOnSuccess = false } = {}) => {
        const pinData = await fetchPlexPinAuthToken(pinId);

        if (!pinData.authToken) {
            const message = 'Plex sign-in did not complete in time — please try again';
            log(`Plex login failed for pin ${pinId}: authToken not ready`);
            if (redirectOnSuccess) {
                return res.redirect(withBasePath('/?loginError=' + encodeURIComponent(message)));
            }
            return res.status(400).json({ error: message });
        }

        const userRes = await apiFetch('https://plex.tv/api/v2/user', pinData.authToken);
        if (!userRes.ok) throw new Error('Failed to fetch user info');
        const userData = await userRes.json();

        const config = await loadFile(CONFIG_PATH, {});
        await syncAdminPlexIdFromConfigToken(config);
        const adminId = await getAdminId(config);
        const isAdmin = !!(adminId && String(userData.id) === String(adminId));

        const deletedUsers = await loadFile(DELETED_USERS_PATH, []);
        const sessionUser = {
            id: userData.uuid,
            plexId: userData.id,
            email: userData.email,
            username: userData.username,
            thumb: userData.thumb || null,
            isAdmin,
        };

        if (!isAdmin && isDeletedUser(deletedUsers, sessionUser)) {
            await appendAuditLog('login_blocked_deleted_user', sessionUser, sessionUser);
            clearSessionCookie(req, res);
            const message = 'Your portal session has expired. Please contact the admin for access.';
            if (redirectOnSuccess) {
                return res.redirect(withBasePath('/?loginError=' + encodeURIComponent(message)));
            }
            return res.status(403).json({ error: message });
        }

        if (!isAdmin) {
            const users = await loadFile(USERS_PATH, []);
            const knownUser = findLocalUserForSession(users, sessionUser);
            const canSelfRegister = !!(config.referralEnabled && ref);
            if (knownUser && !isEligibleMember(knownUser)) {
                await appendAuditLog('login_blocked_non_member', sessionUser, knownUser);
                clearSessionCookie(req, res);
                const message = 'Your account does not have active portal access.';
                if (redirectOnSuccess) {
                    return res.redirect(withBasePath('/?loginError=' + encodeURIComponent(message)));
                }
                return res.status(403).json({ error: message });
            }
            if (!knownUser && !canSelfRegister) {
                await appendAuditLog('login_blocked_non_member', sessionUser, sessionUser);
                clearSessionCookie(req, res);
                log(`Plex login blocked for ${sessionUser.username}: not a portal member (admin=${isAdmin}, adminPlexId=${config.adminPlexId || 'unset'})`);
                const message = 'Your account is not registered for this portal.';
                if (redirectOnSuccess) {
                    return res.redirect(withBasePath('/?loginError=' + encodeURIComponent(message)));
                }
                return res.status(403).json({ error: message });
            }
        }

        if (!isAdmin && config.referralEnabled && ref) {
            const users = await loadFile(USERS_PATH, []);
            const isNewUser = !users.find(u => u.id === sessionUser.id || u.plexId === sessionUser.plexId);

            if (isNewUser) {
                const referrer = users.find(u => u.id === ref || u.plexId === ref);
                if (referrer && referrer.plexAccessStatus === 'active') {
                    const trialDays = config.referralTrialDays || 3;
                    const rewardDays = config.referralRewardDays || 7;
                    const newUserObj = {
                        id: sessionUser.id,
                        plexId: sessionUser.plexId,
                        username: sessionUser.username,
                        email: sessionUser.email,
                        joiningDate: new Date().toISOString(),
                        expiryDate: addDays(new Date(), trialDays).toISOString(),
                        plexAccessStatus: 'pending',
                        isTrial: true,
                    };
                    users.push(newUserObj);
                    if (referrer.expiryDate) {
                        referrer.expiryDate = addDays(new Date(referrer.expiryDate), rewardDays).toISOString();
                    }
                    await saveFile(USERS_PATH, users);
                    await appendAuditLog('referral_claimed', sessionUser, referrer, { trialDays, rewardDays });
                    if (config.serverIdentifier && config.plexToken) {
                        inviteUserToPlex(newUserObj, config).catch(e => log('Failed to invite referral: ' + e.message));
                    }
                    if (membershipSync?.ensure) {
                        membershipSync.ensure(newUserObj, config).catch((e) => log(`Request app ensure after referral skipped: ${e.message}`));
                    }
                }
            }
        }

        const token = jwt.sign(sessionUser, JWT_SECRET, { expiresIn: '7d' });
        setSessionCookie(req, res, token);

        if (!isAdmin) {
            const users = await loadFile(USERS_PATH, []);
            const existingUser = users.find(u => u.id === sessionUser.id || u.plexId === sessionUser.plexId);
            if (existingUser) {
                existingUser.lastLogin = new Date().toISOString();
                await saveFile(USERS_PATH, users);
                if (membershipSync?.ensure && existingUser.plexAccessStatus === 'active') {
                    membershipSync.ensure(existingUser, config).catch((e) => log(`Request app ensure on login skipped: ${e.message}`));
                }
            }
        }
        await appendAuditLog('user_login', sessionUser, sessionUser);

        log(`Plex login success for ${sessionUser.username} (admin=${isAdmin}, secureCookie=${FORCE_SECURE_COOKIES})`);

        if (redirectOnSuccess) {
            return res.redirect(withBasePath('/portal'));
        }
        return res.json({ message: 'Logged in successfully', user: sessionUser });
    };

    const assertInitialSetupAccess = async (req, res, options = {}) => {
        const existingConfig = await loadFile(CONFIG_PATH, {});
        const isConfigured = isPortalConfigured(existingConfig);
        if (isConfigured) {
            res.status(403).json({ error: 'Portal is already configured.' });
            return false;
        }
        if (options.allowUnconfigured === true) return true;
        if (canRunInitialSetup(req)) return true;
        const sessionToken = req.cookies && req.cookies.session;
        if (sessionToken) {
            try {
                jwt.verify(sessionToken, JWT_SECRET);
                return true;
            } catch (e) { /* fall through */ }
        }
        res.status(403).json({ error: 'Initial setup denied: localhost, valid setup token, or admin session required.' });
        return false;
    };

    app.post('/api/auth/plex/login', authRateLimit, async (req, res) => {
        try {
            const clientId = getClientId();
            const response = await fetchImpl('https://plex.tv/api/v2/pins?strong=true', {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'X-Plex-Product': 'Server Manager Portal',
                    'X-Plex-Client-Identifier': clientId
                }
            });
            if (!response.ok) throw new Error('Failed to generate Plex PIN');
            const data = await response.json();
            res.json({ ...data, clientIdentifier: clientId });
        } catch (err) {
            log('Error in plex login: ' + err.message);
            res.status(500).json({ error: 'Failed to initiate login' });
        }
    });

    app.post('/api/auth/plex/callback', authCallbackRateLimit, async (req, res) => {
        const { pinId, ref } = req.body;
        if (!pinId) return res.status(400).json({ error: 'pinId is required' });

        try {
            await handlePlexPinLogin(req, res, pinId, ref);
        } catch (err) {
            log('Error in plex callback: ' + err.message);
            res.status(500).json({ error: 'Failed to verify login' });
        }
    });

    app.get('/api/auth/plex/callback', authCallbackRateLimit, async (req, res) => {
        const { pinId, ref } = req.query;
        if (!pinId) return res.redirect(withBasePath('/?loginError=' + encodeURIComponent('Missing pin ID')));

        try {
            await handlePlexPinLogin(req, res, String(pinId), ref, { redirectOnSuccess: true });
        } catch (err) {
            log('Error in plex GET callback: ' + err.message);
            clearSessionCookie(req, res);
            res.redirect(withBasePath('/?loginError=' + encodeURIComponent('Login failed. Please try again.')));
        }
    });

    app.post('/api/setup/plex/callback', setupRateLimit, authRateLimit, async (req, res) => {
        if (!(await assertInitialSetupAccess(req, res, { allowUnconfigured: true }))) return;
        const { pinId } = req.body;
        if (!pinId) return res.status(400).json({ error: 'pinId is required' });

        try {
            const pinData = await fetchPlexPinAuthToken(pinId);
            if (!pinData.authToken) {
                return res.status(400).json({ error: 'Plex sign-in not completed yet. Please try again.' });
            }

            const userRes = await apiFetch('https://plex.tv/api/v2/user', pinData.authToken);
            if (!userRes.ok) throw new Error('Failed to fetch Plex user info');
            const userData = await userRes.json();

            const servers = await fetchOwnedPlexServers(pinData.authToken);
            if (!servers.length) {
                return res.status(400).json({ error: 'No owned Plex servers found for this account. You must sign in as the server owner.' });
            }

            res.json({
                token: pinData.authToken,
                servers,
                username: userData.username || userData.title || userData.email || 'Plex User',
                email: userData.email || '',
            });
        } catch (err) {
            log(`Setup Plex callback error: ${err.message}`);
            res.status(500).json({ error: 'Failed to complete Plex sign-in.' });
        }
    });
};
