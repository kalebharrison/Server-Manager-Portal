import { useCallback, useState } from 'react';
import { apiFetch } from '../shared/api';
import { getDiscoverItemKey } from './discoverItemUtils';

type PushToast = (msg: string, type: 'success' | 'error') => void;

const resolveMediaType = (item: any): 'movie' | 'tv' | null => {
    const raw = String(item?.mediaType || item?.type || '').toLowerCase();
    if (raw === 'movie' || raw === 'movies') return 'movie';
    if (raw === 'tv' || raw === 'show' || raw === 'shows' || raw === 'series') return 'tv';
    return null;
};

const resolveMediaId = (item: any): number | null => {
    const id = Number(item?.tmdbId ?? item?.mediaId ?? item?.id);
    return Number.isFinite(id) && id > 0 ? id : null;
};

export function useDiscoverNotify(pushToast?: PushToast) {
    const [busyKeys, setBusyKeys] = useState<Set<string>>(() => new Set());
    const [localNotifying, setLocalNotifying] = useState<Set<string>>(() => new Set());
    const [localCleared, setLocalCleared] = useState<Set<string>>(() => new Set());

    const itemKey = useCallback((item: any) => (
        getDiscoverItemKey(item) || `${resolveMediaType(item)}-${resolveMediaId(item)}`
    ), []);

    const isBusy = useCallback((item: any) => busyKeys.has(itemKey(item)), [busyKeys, itemKey]);

    const isNotifying = useCallback((item: any) => {
        const key = itemKey(item);
        if (localCleared.has(key)) return false;
        if (localNotifying.has(key)) return true;
        return item?.notifying === true;
    }, [itemKey, localCleared, localNotifying]);

    const canNotify = useCallback((item: any) => {
        const mediaType = resolveMediaType(item);
        const mediaId = resolveMediaId(item);
        if (!mediaType || !mediaId) return false;
        if (isNotifying(item) || isBusy(item)) return false;
        if (item?.canNotify === true) return true;
        // One-click notify for titles already requested / downloading / partial.
        const status = Number(item?.mediaInfo?.status ?? item?.media?.status);
        if (status === 2 || status === 3 || status === 4) return true;
        const requests = Array.isArray(item?.mediaInfo?.requests) ? item.mediaInfo.requests : [];
        if (requests.length > 0 && status !== 5) return true;
        return false;
    }, [isBusy, isNotifying]);

    const toggleNotify = useCallback(async (item: any) => {
        const mediaType = resolveMediaType(item);
        const mediaId = resolveMediaId(item);
        const key = itemKey(item);
        if (!mediaType || !mediaId) return;

        const currentlyNotifying = isNotifying(item);
        if (!currentlyNotifying && !canNotify(item) && item?.canNotify !== true) return;

        setBusyKeys((prev) => new Set(prev).add(key));
        try {
            if (currentlyNotifying) {
                const res = await apiFetch('/api/discovery/notify', {
                    method: 'DELETE',
                    body: JSON.stringify({ mediaType, mediaId }),
                });
                if (res?.error) throw new Error(res.error);
                setLocalNotifying((prev) => {
                    const next = new Set(prev);
                    next.delete(key);
                    return next;
                });
                setLocalCleared((prev) => new Set(prev).add(key));
                pushToast?.('Stopped notifications for this title', 'success');
            } else {
                const res = await apiFetch('/api/discovery/notify', {
                    method: 'POST',
                    body: JSON.stringify({ mediaType, mediaId }),
                });
                if (res?.error) throw new Error(res.error);
                setLocalCleared((prev) => {
                    const next = new Set(prev);
                    next.delete(key);
                    return next;
                });
                setLocalNotifying((prev) => new Set(prev).add(key));
                pushToast?.('You will be notified when this is available', 'success');
            }
        } catch (err: any) {
            pushToast?.(err?.message || 'Failed to update notify preference', 'error');
        } finally {
            setBusyKeys((prev) => {
                const next = new Set(prev);
                next.delete(key);
                return next;
            });
        }
    }, [canNotify, isNotifying, itemKey, pushToast]);

    return {
        toggleNotify,
        canNotify,
        isNotifying,
        isBusy,
    };
}

export type DiscoverNotifyApi = ReturnType<typeof useDiscoverNotify>;
