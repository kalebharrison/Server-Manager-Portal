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

    const resolveLocalPlexAccountId = async (config, uri, sessionUser) => {
        const norm = (v) => String(v || '').trim().toLowerCase();
        const users = await loadFile(usersPath, []);
        const portalUser = findLocalUserForSession(users, sessionUser);
        if (portalUser?.plexAccountId) return String(portalUser.plexAccountId);

        const { list: accounts } = await fetchPlexServerAccounts(uri, config);
        if (!accounts.length) {
            return sessionUser?.plexId ? String(sessionUser.plexId) : null;
        }

        const byName = accounts.find((a) => norm(a.name) === norm(sessionUser?.username));
        if (byName) return String(byName.id);

        if (sessionUser?.email) {
            const byEmail = accounts.find((a) =>
                norm(a.name) === norm(sessionUser.email) || norm(a.email) === norm(sessionUser.email),
            );
            if (byEmail) return String(byEmail.id);
        }

        if (sessionUser?.plexId) {
            const byPlexId = accounts.find((a) => String(a.id) === String(sessionUser.plexId));
            if (byPlexId) return String(byPlexId.id);
        }

        // Home admin is usually local account 1, but only as a last resort for admins.
        if (sessionUser?.isAdmin) {
            const home = accounts.find((a) => String(a.id) === '1') || accounts[0];
            if (home) return String(home.id);
        }

        return null;
    };

    const invalidatePlexAccountCache = () => {
        cachedPlexAccounts = null;
        cachedPlexAccountsAt = 0;
    };

    return {
        fetchPlexServerAccounts,
        resolveLocalPlexAccountId,
        invalidatePlexAccountCache,
    };
};
