import { useEffect, useState } from 'react';

import { apiFetch } from '../../shared/api';
import { resolveHomeAnalyticsDays } from '../../shared/userProfile';
import { buildJellyfinHomeAnalytics } from './userDashboardUtils';
import { analyticsCacheKey, readCachedHomeAnalytics } from './userDashboardCache';

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

    useEffect(() => {
        let cancelled = false;
        const fetchAnalytics = async () => {
            if (!sessionInfo?.session?.isAdmin && !user) {
                setAnalyticsLoading(false);
                return;
            }
            const cached = readCachedHomeAnalytics(sessionInfo, analyticsDays);
            if (cached) setAnalytics(cached);
            try {
                setAnalyticsLoading(!cached);
                setAnalyticsError(null);
                const res = isJellyfinPortal
                    ? buildJellyfinHomeAnalytics(await apiFetch(`/api/jellystat/analytics?days=${analyticsDays}`))
                    : await apiFetch(`/api/plex/analytics/me?days=${analyticsDays}`);
                if (cancelled) return;
                setAnalytics(res);
                sessionStorage.setItem(analyticsCacheKey(sessionInfo, analyticsDays), JSON.stringify(res));
            } catch (e: any) {
                if (!cancelled) {
                    const message = e?.message || 'Failed to load your analytics';
                    if (!cached) {
                        setAnalyticsError(message);
                        setAnalytics(null);
                        onErrorToast(message);
                    } else {
                        setAnalyticsError(null);
                    }
                }
            } finally {
                if (!cancelled) setAnalyticsLoading(false);
            }
        };
        fetchAnalytics();
        return () => { cancelled = true; };
    }, [user, sessionInfo.session.isAdmin, analyticsDays, isJellyfinPortal, onErrorToast]);

    return {
        analytics,
        analyticsLoading,
        analyticsDays,
        setAnalyticsDays,
        analyticsError,
    };
};
