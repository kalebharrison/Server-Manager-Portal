const normalizeUrl = (url) => String(url || '').replace(/\/+$/, '');

const parseExtensions = (raw) => {
    const text = String(raw || '');
    return [...new Set(
        text
            .split(/[\n,]+/)
            .map((entry) => entry.trim())
            .filter(Boolean)
            .map((entry) => entry.replace(/^\*\./, '').replace(/^\./, '').toLowerCase())
            .filter(Boolean),
    )];
};

export const createQbitClient = ({
    fetchWithTimeout = fetch,
    resolveIntegrationUrlForFetch = async (url) => url,
    log = () => {},
} = {}) => {
    const cookieByBase = new Map();

    const resolveBase = async (config) => {
        const raw = normalizeUrl(config?.qcQbitUrl);
        if (!raw) return '';
        return String(await resolveIntegrationUrlForFetch(raw) || '').replace(/\/+$/, '');
    };

    const isConfigured = (config) => Boolean(String(config?.qcQbitUrl || '').trim());

    const request = async (config, path, options = {}) => {
        const base = await resolveBase(config);
        if (!base) throw new Error('qBittorrent URL is not configured');
        const suffix = path.startsWith('/') ? path : `/${path}`;
        const url = `${base}${suffix}`;
        const headers = { ...(options.headers || {}) };
        const cookie = cookieByBase.get(base);
        if (cookie) headers.Cookie = cookie;
        let body = options.body;
        if (body && typeof body === 'object' && !(body instanceof URLSearchParams) && !(body instanceof Buffer)) {
            headers['Content-Type'] = headers['Content-Type'] || 'application/x-www-form-urlencoded';
            body = new URLSearchParams(body).toString();
        }
        const timeoutMs = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : 20000;
        const { timeoutMs: _ignored, skipAuthRetry, ...fetchOptions } = options;
        const response = await fetchWithTimeout(url, { ...fetchOptions, headers, body }, timeoutMs);
        const setCookie = response.headers?.get?.('set-cookie') || response.headers?.get?.('Set-Cookie');
        if (setCookie) {
            const sid = String(setCookie).split(';')[0].trim();
            if (sid) cookieByBase.set(base, sid);
        }
        if (response.status === 403 && !skipAuthRetry) {
            await login(config);
            return request(config, path, { ...options, skipAuthRetry: true });
        }
        return response;
    };

    const login = async (config) => {
        const base = await resolveBase(config);
        if (!base) throw new Error('qBittorrent URL is not configured');
        const username = String(config?.qcQbitUsername || '');
        const password = String(config?.qcQbitPassword || '');
        const body = new URLSearchParams({ username, password }).toString();
        const response = await fetchWithTimeout(
            `${base}/api/v2/auth/login`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body,
            },
            20000,
        );
        const setCookie = response.headers?.get?.('set-cookie') || response.headers?.get?.('Set-Cookie');
        if (setCookie) {
            const sid = String(setCookie).split(';')[0].trim();
            if (sid) cookieByBase.set(base, sid);
        }
        const text = await response.text().catch(() => '');
        if (!response.ok || (text && text.trim().toLowerCase() === 'fails.')) {
            throw new Error(`qBittorrent login failed (${response.status}${text ? `: ${text.slice(0, 120)}` : ''})`);
        }
        const cookie = cookieByBase.get(base) || null;
        if (!cookie) {
            // Some reverse proxies omit Set-Cookie in Node fetch; still treat ok body as success.
            log('[qc/qbit] login ok but no SID cookie captured');
        }
        return cookie;
    };

    const ensureSession = async (config) => {
        const base = await resolveBase(config);
        if (!base) throw new Error('qBittorrent URL is not configured');
        if (!cookieByBase.has(base)) await login(config);
    };

    const listTorrents = async (config) => {
        if (!isConfigured(config)) return [];
        await ensureSession(config);
        const response = await request(config, '/api/v2/torrents/info');
        if (!response.ok) {
            const detail = await response.text().catch(() => '');
            throw new Error(`qBittorrent torrents/info failed (${response.status}${detail ? `: ${detail.slice(0, 160)}` : ''})`);
        }
        const rows = await response.json().catch(() => []);
        return (Array.isArray(rows) ? rows : []).map((row) => {
            const hash = String(row?.hash || '').toLowerCase();
            return {
                id: hash,
                hash,
                name: String(row?.name || ''),
                state: String(row?.state || ''),
                progress: Number(row?.progress) || 0,
                size: Number(row?.size) || 0,
                dlspeed: Number(row?.dlspeed) || 0,
                num_seeds: Number(row?.num_seeds) || 0,
                num_leechs: Number(row?.num_leechs) || 0,
                added_on: Number(row?.added_on) || 0,
                completion_on: Number(row?.completion_on) || 0,
                category: String(row?.category || ''),
                save_path: String(row?.save_path || ''),
                client: 'qbit',
            };
        });
    };

    const deleteTorrent = async (config, hash, { deleteFiles = false } = {}) => {
        if (!hash) return false;
        await ensureSession(config);
        const response = await request(config, '/api/v2/torrents/delete', {
            method: 'POST',
            body: {
                hashes: String(hash),
                deleteFiles: deleteFiles ? 'true' : 'false',
            },
        });
        if (!response.ok) {
            const detail = await response.text().catch(() => '');
            throw new Error(`qBittorrent delete failed (${response.status}${detail ? `: ${detail.slice(0, 160)}` : ''})`);
        }
        return true;
    };

    const getAppPreferences = async (config) => {
        await ensureSession(config);
        const response = await request(config, '/api/v2/app/preferences');
        if (!response.ok) {
            const detail = await response.text().catch(() => '');
            throw new Error(`qBittorrent preferences failed (${response.status}${detail ? `: ${detail.slice(0, 160)}` : ''})`);
        }
        return response.json().catch(() => ({}));
    };

    const getTransferInfo = async (config) => {
        await ensureSession(config);
        const response = await request(config, '/api/v2/transfer/info');
        if (!response.ok) {
            const detail = await response.text().catch(() => '');
            throw new Error(`qBittorrent transfer info failed (${response.status}${detail ? `: ${detail.slice(0, 160)}` : ''})`);
        }
        return response.json().catch(() => ({}));
    };

    const getNetworkHealth = async (config, { incompleteCount = 0 } = {}) => {
        if (!isConfigured(config)) {
            return { ok: true, reachable: false, reason: 'not_configured' };
        }
        try {
            const info = await getTransferInfo(config);
            const status = String(info?.connection_status || '').toLowerCase();
            const dhtNodes = Number(info?.dht_nodes);
            if (status === 'disconnected') {
                return {
                    ok: false,
                    reachable: true,
                    connectionStatus: status,
                    dhtNodes: Number.isFinite(dhtNodes) ? dhtNodes : null,
                    reason: 'disconnected',
                };
            }
            if (incompleteCount > 0 && Number.isFinite(dhtNodes) && dhtNodes <= 0) {
                return {
                    ok: false,
                    reachable: true,
                    connectionStatus: status || null,
                    dhtNodes,
                    reason: 'dht_dead',
                };
            }
            return {
                ok: true,
                reachable: true,
                connectionStatus: status || null,
                dhtNodes: Number.isFinite(dhtNodes) ? dhtNodes : null,
                reason: null,
            };
        } catch (error) {
            return {
                ok: false,
                reachable: false,
                reason: 'unreachable',
                error: error.message,
            };
        }
    };

    const getBlockedExtensions = async (config) => {
        if (!isConfigured(config)) return [];
        const prefs = await getAppPreferences(config);
        return parseExtensions(prefs?.excluded_file_names);
    };

    const setAppPreferences = async (config, prefs = {}) => {
        if (!isConfigured(config)) return {};
        await ensureSession(config);
        const response = await request(config, '/api/v2/app/setPreferences', {
            method: 'POST',
            body: {
                json: JSON.stringify(prefs),
            },
        });
        if (!response.ok) {
            const detail = await response.text().catch(() => '');
            throw new Error(`qBittorrent setPreferences failed (${response.status}${detail ? `: ${detail.slice(0, 160)}` : ''})`);
        }
        return getAppPreferences(config);
    };

    const setBlockedExtensions = async (config, extensions = []) => {
        if (!isConfigured(config)) return [];
        const normalized = parseExtensions(
            (Array.isArray(extensions) ? extensions : [])
                .map((entry) => String(entry || '').trim())
                .filter(Boolean)
                .join('\n'),
        );
        const value = normalized.map((ext) => `*.${ext}`).join('\n');
        await setAppPreferences(config, { excluded_file_names: value });
        return normalized;
    };

    const applyQcAlignment = async (config, recommended = {}) => {
        if (!isConfigured(config)) return null;
        const patch = {};
        if (recommended.max_seeding_time != null) {
            patch.max_seeding_time = Number(recommended.max_seeding_time);
        }
        if (recommended.max_active_torrents != null) {
            patch.max_active_torrents = Number(recommended.max_active_torrents);
        }
        if (!Object.keys(patch).length) return getAppPreferences(config);
        return setAppPreferences(config, patch);
    };

    return {
        isConfigured,
        login,
        listTorrents,
        deleteTorrent,
        getTransferInfo,
        getAppPreferences,
        setAppPreferences,
        getNetworkHealth,
        getBlockedExtensions,
        setBlockedExtensions,
        applyQcAlignment,
    };
};
