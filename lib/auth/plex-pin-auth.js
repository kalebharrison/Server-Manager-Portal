import jwt from 'jsonwebtoken';

import { addDays } from '../core/date-utils.js';
import { isDeletedUser } from '../users/deleted-users.js';
import { ensureAdminPortalUser } from '../users/ensure-admin-portal-user.js';
import { signSessionJwt } from './jwt-session.js';

export const fetchPlexPinAuthToken = async (pinId, { getClientId, log, fetchImpl = fetch, attempts = 10, delayMs = 800 } = {}) => {
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

export const createPlexPinLoginHandler = ({
    configPath,
    usersPath,
    deletedUsersPath,
    jwtSecret,
    forceSecureCookies,
    loadFile,
    saveFile,
    apiFetch,
    withBasePath,
    clearSessionCookie,
    setSessionCookie,
    appendAuditLog,
    findLocalUserForSession,
    syncAdminPlexIdFromConfigToken,
    getAdminId,
    inviteUserToPlex,
    isEligibleMember,
    membershipSync = null,
    log,
    fetchPlexPinAuthToken: fetchPinToken,
}) => {
    const CONFIG_PATH = configPath;
    const USERS_PATH = usersPath;
    const DELETED_USERS_PATH = deletedUsersPath;
    const JWT_SECRET = jwtSecret;
    const FORCE_SECURE_COOKIES = forceSecureCookies;

    return async (req, res, pinId, ref, { redirectOnSuccess = false } = {}) => {
        const pinData = await fetchPinToken(pinId);

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
            const isNewUser = !users.find((u) => u.id === sessionUser.id || u.plexId === sessionUser.plexId);

            if (isNewUser) {
                const referrer = users.find((u) => u.id === ref || u.plexId === ref);
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
                        inviteUserToPlex(newUserObj, config).catch((e) => log('Failed to invite referral: ' + e.message));
                    }
                    if (membershipSync?.ensure) {
                        membershipSync.ensure(newUserObj, config).catch((e) => log(`Request app ensure after referral skipped: ${e.message}`));
                    }
                }
            }
        }

        const token = signSessionJwt(jwt, sessionUser, JWT_SECRET, { expiresIn: '7d' });
        setSessionCookie(req, res, token);

        if (isAdmin) {
            const users = await loadFile(USERS_PATH, []);
            const ensured = ensureAdminPortalUser(users, sessionUser);
            if (ensured.user) {
                ensured.user.lastLogin = new Date().toISOString();
            }
            if (ensured.changed || ensured.user) {
                await saveFile(USERS_PATH, ensured.users);
            }
            if (ensured.created) {
                await appendAuditLog('admin_portal_user_ensured', sessionUser, ensured.user).catch(() => {});
            }
            if (membershipSync?.ensure && ensured.user) {
                membershipSync.ensure(ensured.user, config).catch((e) => log(`Request app ensure on admin login skipped: ${e.message}`));
            }
        } else {
            const users = await loadFile(USERS_PATH, []);
            const existingUser = users.find((u) => u.id === sessionUser.id || u.plexId === sessionUser.plexId);
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
};
