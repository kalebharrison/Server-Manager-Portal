import { useCallback, useState } from 'react';
import { apiFetch } from '../shared/api';
import { resolveMediaAvailabilityState } from './discoverAvailability';
import { getDiscoverItemKey } from './discoverItemUtils';

type PushToast = (msg: string, type: 'success' | 'error') => void;

const BLOCKED_KINDS = new Set([
    'available',
    'upToDate',
    'partial',
    'pending',
    'processing',
    'requested',
    'blacklisted',
]);

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

export function useDiscoverQuickRequest(pushToast?: PushToast) {
    const [requestingKeys, setRequestingKeys] = useState<Set<string>>(() => new Set());
    const [requestedKeys, setRequestedKeys] = useState<Set<string>>(() => new Set());

    const itemKey = useCallback((item: any) => (
        getDiscoverItemKey(item) || `${resolveMediaType(item)}-${resolveMediaId(item)}`
    ), []);

    const isRequesting = useCallback((item: any) => requestingKeys.has(itemKey(item)), [itemKey, requestingKeys]);
    const isRequested = useCallback((item: any) => requestedKeys.has(itemKey(item)), [itemKey, requestedKeys]);

    const canQuickRequest = useCallback((item: any) => {
        const mediaType = resolveMediaType(item);
        const mediaId = resolveMediaId(item);
        if (!mediaType || !mediaId) return false;
        if (isRequested(item) || isRequesting(item)) return false;
        const { kind } = resolveMediaAvailabilityState(item);
        return !BLOCKED_KINDS.has(kind);
    }, [isRequested, isRequesting]);

    const quickRequest = useCallback(async (item: any) => {
        const mediaType = resolveMediaType(item);
        const mediaId = resolveMediaId(item);
        const key = itemKey(item);
        if (!mediaType || !mediaId || !canQuickRequest(item)) return;

        setRequestingKeys((prev) => new Set(prev).add(key));
        try {
            const body: Record<string, unknown> = {
                mediaType,
                mediaId,
                is4k: false,
            };
            if (mediaType === 'tv') body.seasons = 'all';

            const res = await apiFetch('/api/discovery/request', {
                method: 'POST',
                body: JSON.stringify(body),
            });
            if (res?.error) throw new Error(res.error);

            setRequestedKeys((prev) => new Set(prev).add(key));
            const title = item?.title || item?.name || 'Title';
            pushToast?.(
                mediaType === 'tv'
                    ? `Requested "${title}" (all seasons)`
                    : `Requested "${title}"`,
                'success',
            );
        } catch (err: any) {
            pushToast?.(err?.message || 'Failed to submit request', 'error');
        } finally {
            setRequestingKeys((prev) => {
                const next = new Set(prev);
                next.delete(key);
                return next;
            });
        }
    }, [canQuickRequest, itemKey, pushToast]);

    return {
        quickRequest,
        canQuickRequest,
        isRequesting,
        isRequested,
    };
}
