const normalizeUrl = (url) => String(url || '').replace(/\/+$/, '');

const parseExtensions = (raw) => {
    const text = Array.isArray(raw) ? raw.join(',') : String(raw || '');
    return [...new Set(
        text
            .split(/[\n,]+/)
            .map((entry) => entry.trim())
            .filter(Boolean)
            .map((entry) => entry.replace(/^\*\./, '').replace(/^\./, '').toLowerCase())
            .filter(Boolean),
    )];
};

const sizeFromMb = (value) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    // SAB often reports MB; treat values under 1e6 as MB, otherwise bytes.
    return n > 0 && n < 1e6 ? Math.round(n * 1024 * 1024) : Math.round(n);
};

export const createSabClient = ({
    fetchWithTimeout = fetch,
    resolveIntegrationUrlForFetch = async (url) => url,
    log = () => {},
} = {}) => {
    const resolveBase = async (config) => {
        const raw = normalizeUrl(config?.qcSabUrl);
        if (!raw) return '';
        return String(await resolveIntegrationUrlForFetch(raw) || '').replace(/\/+$/, '');
    };

    const isConfigured = (config) => Boolean(
        String(config?.qcSabUrl || '').trim() && String(config?.qcSabApiKey || '').trim(),
    );

    const api = async (config, mode, params = {}) => {
        const base = await resolveBase(config);
        if (!base) throw new Error('SABnzbd URL is not configured');
        const apiKey = String(config?.qcSabApiKey || '').trim();
        if (!apiKey) throw new Error('SABnzbd API key is not configured');
        const { timeoutMs: timeoutOverride, ...queryParams } = params;
        const query = new URLSearchParams({
            apikey: apiKey,
            output: 'json',
            mode: String(mode),
            ...Object.fromEntries(
                Object.entries(queryParams)
                    .filter(([, value]) => value !== undefined && value !== null)
                    .map(([key, value]) => [key, String(value)]),
            ),
        });
        const url = `${base}/api?${query.toString()}`;
        const timeoutMs = Number(timeoutOverride) > 0 ? Number(timeoutOverride) : 20000;
        const response = await fetchWithTimeout(url, { method: 'GET' }, timeoutMs);
        if (!response.ok) {
            const detail = await response.text().catch(() => '');
            throw new Error(`SABnzbd ${mode} failed (${response.status}${detail ? `: ${detail.slice(0, 160)}` : ''})`);
        }
        return response.json().catch(() => ({}));
    };

    const normalizeQueueSlot = (slot) => {
        const id = String(slot?.nzo_id || slot?.nzoId || '');
        const mb = Number(slot?.mb) || 0;
        const mbleft = Number(slot?.mbleft);
        const progress = Number.isFinite(mbleft) && mb > 0
            ? Math.max(0, Math.min(1, 1 - (mbleft / mb)))
            : Number(slot?.percentage) > 0
                ? Math.max(0, Math.min(1, Number(slot.percentage) / 100))
                : 0;
        const status = String(slot?.status || slot?.state || '').toLowerCase();
        return {
            id,
            nzo_id: id,
            name: String(slot?.filename || slot?.name || ''),
            state: status || 'queued',
            progress,
            size: sizeFromMb(mb || slot?.bytes || slot?.size),
            sizeleft: sizeFromMb(Number.isFinite(mbleft) ? mbleft : 0),
            client: 'sab',
            failMessage: String(slot?.fail_message || slot?.error || '').trim() || null,
            timeleft: String(slot?.timeleft || ''),
            category: String(slot?.cat || slot?.category || ''),
        };
    };

    const normalizeHistorySlot = (slot) => {
        const id = String(slot?.nzo_id || slot?.nzoId || '');
        const status = String(slot?.status || '').toLowerCase();
        const failed = status === 'failed' || Boolean(slot?.fail_message);
        return {
            id,
            nzo_id: id,
            name: String(slot?.name || slot?.nzb_name || ''),
            state: status || (failed ? 'failed' : 'completed'),
            progress: failed ? Number(slot?.percentage || 0) / 100 : 1,
            size: sizeFromMb(slot?.bytes || slot?.size || slot?.downloaded),
            sizeleft: 0,
            client: 'sab',
            failMessage: String(slot?.fail_message || slot?.error || '').trim() || null,
            completedAt: slot?.completed ? Number(slot.completed) * (Number(slot.completed) < 1e12 ? 1000 : 1) : null,
            category: String(slot?.category || slot?.cat || ''),
        };
    };

    const listQueue = async (config) => {
        if (!isConfigured(config)) return [];
        const payload = await api(config, 'queue', { limit: 200 });
        const slots = payload?.queue?.slots || payload?.slots || [];
        return (Array.isArray(slots) ? slots : []).map(normalizeQueueSlot).filter((item) => item.id);
    };

    const listHistory = async (config) => {
        if (!isConfigured(config)) return [];
        const payload = await api(config, 'history', { limit: 100 });
        const slots = payload?.history?.slots || payload?.slots || [];
        return (Array.isArray(slots) ? slots : []).map(normalizeHistorySlot).filter((item) => item.id);
    };

    const deleteItem = async (config, nzoId, { deleteFiles = false } = {}) => {
        if (!nzoId) return false;
        // Prefer queue delete; fall back to history delete.
        try {
            await api(config, 'queue', {
                name: 'delete',
                value: String(nzoId),
                del_files: deleteFiles ? 1 : 0,
            });
            return true;
        } catch (error) {
            log(`[qc/sab] queue delete failed for ${nzoId}: ${error.message}`);
            await api(config, 'history', {
                name: 'delete',
                value: String(nzoId),
                del_files: deleteFiles ? 1 : 0,
            });
            return true;
        }
    };

    const getConfigSection = async (config, section, keyword = null) => {
        const params = { section };
        if (keyword) params.keyword = keyword;
        const payload = await api(config, 'get_config', params);
        if (payload?.status === false) {
            throw new Error(payload?.error || 'SABnzbd get_config failed');
        }
        return payload?.config?.[section] || payload?.[section] || payload?.config || {};
    };

    const getBlockedExtensions = async (config) => {
        if (!isConfigured(config)) return [];
        // SABnzbd 4+/5 use unwanted_extensions (not the obsolete ext_blacklist).
        const misc = await getConfigSection(config, 'misc', 'unwanted_extensions');
        const raw = misc?.unwanted_extensions
            ?? misc?.ext_blacklist
            ?? '';
        return parseExtensions(raw);
    };

    const setBlockedExtensions = async (config, extensions = []) => {
        if (!isConfigured(config)) return [];
        const normalized = parseExtensions(
            (Array.isArray(extensions) ? extensions : [])
                .map((entry) => String(entry || '').trim())
                .filter(Boolean)
                .join(','),
        );
        const value = normalized.join(',');
        const payload = await api(config, 'set_config', {
            section: 'misc',
            keyword: 'unwanted_extensions',
            value,
        });
        if (payload?.status === false) {
            throw new Error(payload?.error || 'SABnzbd set_config failed for unwanted_extensions');
        }
        const saved = payload?.config?.misc?.unwanted_extensions;
        return parseExtensions(saved != null ? saved : normalized);
    };

    return {
        isConfigured,
        listQueue,
        listHistory,
        deleteItem,
        getBlockedExtensions,
        setBlockedExtensions,
    };
};
