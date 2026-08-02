import { useCallback, useEffect, useState } from 'react';

import { apiFetch } from '../../shared/api';
import { useVisibleInterval } from '../../shared/useVisibleInterval';
import { resolveHomeAnalyticsDays } from '../../shared/userProfile';
import { buildJellyfinHomeAnalytics } from './userDashboardUtils';
import { analyticsCacheKey, readCachedHomeAnalytics } from './userDashboardCache';

const HOME_ANALYTICS_REFRESH_MS = 5 * 60 * 1000;

type UseUserDashboardAnalyticsOptions = {
    sessionInfo: any;
    user: any;
    isJellyfinPortal: boolean;
    onErrorToast: (message: string) => void;
};

export const useUserDashboardAnalytics = ({
    sessionInfo,
    user,
    isJellyfinPortal,
    onErrorToast,
}: UseUserDashboardAnalyticsOptions) => {
    const [analytics, setAnalytics] = useState<any>(() => readCachedHomeAnalytics(sessionInfo, 30));
    const [analyticsLoading, setAnalyticsLoading] = useState(() => !readCachedHomeAnalytics(sessionInfo, 30));
    const [analyticsDays, setAnalyticsDays] = useState<number | 'all'>(() => resolveHomeAnalyticsDays(sessionInfo?.account));
    const [analyticsError, setAnalyticsError] = useState<string | null>(null);

    useEffect(() => {
        setAnalyticsDays(resolveHomeAnalyticsDays(user));
    }, [user?.homeAnalyticsDays]);

    const fetchAnalytics = useCallback(async (options: { quiet?: boolean } = {}) => {
        if (!sessionInfo?.session?.isAdmin && !user) {
            setAnalyticsLoading(false);
            return;
        }
        const cached = readCachedHomeAnalytics(sessionInfo, analyticsDays);
        if (cached && !options.quiet) setAnalytics(cached);
        try {
            if (!options.quiet) setAnalyticsLoading(!cached);
            setAnalyticsError(null);
            const res = isJellyfinPortal
                ? buildJellyfinHomeAnalytics(await apiFetch(`/api/jellystat/analytics?days=${analyticsDays}`, {
                    forceRefresh: true,
                    cacheTtlMs: 0,
                }))
                : await apiFetch(`/api/plex/analytics/me?days=${analyticsDays}`, {
                    forceRefresh: true,
                    cacheTtlMs: 0,
                });
            setAnalytics(res);
            sessionStorage.setItem(analyticsCacheKey(sessionInfo, analyticsDays), JSON.stringify(res));
        } catch (e: any) {
            const message = e?.message || 'Failed to load your analytics';
            if (!cached) {
                setAnalyticsError(message);
                setAnalytics(null);
                onErrorToast(message);
            } else {
                setAnalyticsError(null);
            }
        } finally {
            setAnalyticsLoading(false);
        }
    }, [
        user,
        sessionInfo?.session?.isAdmin,
        sessionInfo?.session?.accountId,
        sessionInfo?.session?.username,
        analyticsDays,
        isJellyfinPortal,
        onErrorToast,
    ]);

    useEffect(() => {
        void fetchAnalytics();
    }, [fetchAnalytics]);

    useVisibleInterval(() => { void fetchAnalytics({ quiet: true }); }, HOME_ANALYTICS_REFRESH_MS);

    return {
        analytics,
        analyticsLoading,
        analyticsDays,
        setAnalyticsDays,
        analyticsError,
    };
};
