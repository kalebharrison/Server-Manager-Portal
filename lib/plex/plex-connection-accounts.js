export const expandLocalPlexAccountIds = (primaryId, accounts = [], sessionUser = {}) => {
    const norm = (value) => String(value || '').trim().toLowerCase();
    const ids = new Set();
    if (primaryId != null && String(primaryId).trim() !== '') {
        ids.add(String(primaryId));
    }

    const sessionNames = [
        sessionUser?.username,
        sessionUser?.email,
        sessionUser?.displayName,
    ].map(norm).filter(Boolean);

    for (const account of (Array.isArray(accounts) ? accounts : [])) {
        const accountId = String(account?.id ?? '').trim();
        if (!accountId) continue;
        const accountName = norm(account?.name);
        const accountEmail = norm(account?.email);
        if (sessionNames.some((name) => name === accountName || name === accountEmail)) {
            ids.add(accountId);
        }
        // Rare: local id equals plex.tv id for some shared users.
        if (sessionUser?.plexId != null && accountId === String(sessionUser.plexId)) {
            ids.add(accountId);
        }
    }

    // Owner plays are stored under local account 1 — always include for admins.
    if (sessionUser?.isAdmin) ids.add('1');

    return [...ids];
};

export const createPlexConnectionAccounts = ({
    usersPath,
    loadFile,
    findLocalUserForSession,
    fetchWithTimeout,
}) => {
    let cachedPlexAccounts = null;
    let cachedPlexAccountsAt = 0;

    const fetchPlexServerAccounts = async (uri, config) => {
        if (cachedPlexAccounts && (Date.now() - cachedPlexAccountsAt < 5 * 60 * 1000)) {
            return cachedPlexAccounts;
        }
        const accountsRes = await fetchWithTimeout(`${uri}/accounts?X-Plex-Token=${config.plexToken}`, {
            headers: { Accept: 'application/json' },
        }, 8000).then(r => r.json()).catch(() => null);

        const accounts = accountsRes?.MediaContainer?.Account || [];
        const map = {};
        accounts.forEach((acc) => {
            map[String(acc.id)] = {
                id: String(acc.id),
                name: acc.name || '',
                thumb: acc.thumb || null,
            };
        });
        cachedPlexAccounts = { list: accounts, map };
        cachedPlexAccountsAt = Date.now();
        return cachedPlexAccounts;
    };

    const resolveLocalPlexAccountIds = async (config, uri, sessionUser) => {
        const norm = (v) => String(v || '').trim().toLowerCase();
        const users = await loadFile(usersPath, []);
        const portalUser = findLocalUserForSession(users, sessionUser);
        const primary = portalUser?.plexAccountId ? String(portalUser.plexAccountId) : null;

        const { list: accounts } = await fetchPlexServerAccounts(uri, config);
        if (!accounts.length) {
            if (primary) return [primary];
            return sessionUser?.plexId ? [String(sessionUser.plexId)] : [];
        }

        // Prefer an explicit stored mapping, then name/email matches, then owner fallback.
        let preferred = primary;
        if (!preferred) {
            const byName = accounts.find((a) => norm(a.name) === norm(sessionUser?.username));
            if (byName) preferred = String(byName.id);
        }
        if (!preferred && sessionUser?.email) {
            const byEmail = accounts.find((a) => (
                norm(a.name) === norm(sessionUser.email) || norm(a.email) === norm(sessionUser.email)
            ));
            if (byEmail) preferred = String(byEmail.id);
        }
        if (!preferred && sessionUser?.plexId) {
            const byPlexId = accounts.find((a) => String(a.id) === String(sessionUser.plexId));
            if (byPlexId) preferred = String(byPlexId.id);
        }
        if (!preferred && sessionUser?.isAdmin) {
            const home = accounts.find((a) => String(a.id) === '1') || accounts[0];
            if (home) preferred = String(home.id);
        }

        return expandLocalPlexAccountIds(preferred, accounts, {
            ...sessionUser,
            username: sessionUser?.username || portalUser?.username,
            email: sessionUser?.email || portalUser?.email,
        });
    };

    const resolveLocalPlexAccountId = async (config, uri, sessionUser) => {
        const ids = await resolveLocalPlexAccountIds(config, uri, sessionUser);
        return ids[0] || null;
    };

    const invalidatePlexAccountCache = () => {
        cachedPlexAccounts = null;
        cachedPlexAccountsAt = 0;
    };

    return {
        fetchPlexServerAccounts,
        resolveLocalPlexAccountId,
        resolveLocalPlexAccountIds,
        invalidatePlexAccountCache,
    };
};
