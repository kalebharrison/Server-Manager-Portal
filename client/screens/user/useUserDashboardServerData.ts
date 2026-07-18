import { useCallback, useEffect, useState } from 'react';

import { apiFetch } from '../../shared/api';
import { cacheRefreshMs } from '../../shared/cacheRefresh';
import { useVisibleInterval } from '../../shared/useVisibleInterval';
import { RECENTLY_ADDED_ITEM_LIMIT } from '../DiscoverContent';
import {
    homeServerStatsCacheKey,
    readCachedHomeLibrary,
    readCachedHomeServerStats,
} from './userDashboardCache';

type UseUserDashboardServerDataOptions = {
    publicConfig: any;
    libraryStorageKey: string;
    isJellyfinPortal: boolean;
    analyticsLibraryHealth: any;
};

export const useUserDashboardServerData = ({
    publicConfig,
    libraryStorageKey,
    isJellyfinPortal,
    analyticsLibraryHealth,
}: UseUserDashboardServerDataOptions) => {
    const dashboardRefreshMs = cacheRefreshMs(publicConfig);
    const serverStatsStorageKey = homeServerStatsCacheKey(publicConfig);
    const [serverStats, setServerStats] = useState<any>(() => readCachedHomeServerStats(publicConfig));
    const [dashboardData, setDashboardData] = useState<any>(() => readCachedHomeLibrary(libraryStorageKey));
    const [serverDataLoading, setServerDataLoading] = useState(() => !readCachedHomeServerStats(publicConfig));

    const refreshHomeDashboard = useCallback(async () => {
        try {
            const endpoint = isJellyfinPortal ? '/api/jellyfin/dashboard' : '/api/plex/library';
            const res = await apiFetch(`${endpoint}?limit=${RECENTLY_ADDED_ITEM_LIMIT}`, { cacheTtlMs: dashboardRefreshMs, staleIfErrorMs: 60 * 60_000 });
            setDashboardData(res);
            sessionStorage.setItem(libraryStorageKey, JSON.stringify(res));
        } catch (e) {
            console.error('Failed to refresh dashboard data', e);
        }
    }, [dashboardRefreshMs, isJellyfinPortal, libraryStorageKey]);

    useEffect(() => {
        let pollTimer: ReturnType<typeof setTimeout> | null = null;
        let isMounted = true;

        const fetchServerStats = async () => {
            if (!isMounted) return;
            try {
                if (isJellyfinPortal) {
                    if (isMounted) setServerStats((current: any) => current || { provider: 'jellyfin' });
                    return;
                }
                const res = await apiFetch('/api/plex/stats');
                if (!isMounted) return;
                setServerStats(res);
                sessionStorage.setItem(serverStatsStorageKey, JSON.stringify(res));
                if (res?.isBuilding && typeof document !== 'undefined' && document.visibilityState === 'visible') {
                    pollTimer = setTimeout(fetchServerStats, 5000);
                }
            } catch (e) {
                console.error("Failed to fetch server stats", e);
            } finally {
                if (isMounted) setServerDataLoading(false);
            }
        };
        fetchServerStats();
        void refreshHomeDashboard();
        return () => {
            isMounted = false;
            if (pollTimer) clearTimeout(pollTimer);
        };
    }, [isJellyfinPortal, refreshHomeDashboard, serverStatsStorageKey]);

    useVisibleInterval(refreshHomeDashboard, dashboardRefreshMs);

    useEffect(() => {
        if (!isJellyfinPortal || !analyticsLibraryHealth) return;
        const nextStats = {
            provider: 'jellyfin',
            ...analyticsLibraryHealth,
        };
        setServerStats((current: any) => ({
            ...(current || {}),
            ...nextStats,
        }));
        sessionStorage.setItem(serverStatsStorageKey, JSON.stringify(nextStats));
    }, [isJellyfinPortal, analyticsLibraryHealth, serverStatsStorageKey]);

    return {
        serverStats,
        dashboardData,
        serverDataLoading,
    };
};
