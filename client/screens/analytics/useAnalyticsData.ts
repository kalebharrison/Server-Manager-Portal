import { useEffect, useState } from 'react';

import { apiFetch } from '../../shared/api';

export type AnalyticsData = {
    topUsers: any[];
    topLibraries: any[];
    topMovies: any[];
    topShows: any[];
    topMusic: any[];
    topDevices: any[];
    peakHours: number[];
    totalPlaybacks: number;
    maxConcurrentStreams: number;
    maxDirectPlays: number;
    maxTranscodes: number;
    compare?: {
        previousPeriodDays: string;
        totalPlaybacks: { absolute: number; percent: number | null; previous?: number; current?: number };
        uniqueViewers: { absolute: number; percent: number | null; previous?: number; current?: number };
        libraryPlays: { absolute: number; percent: number | null; previous?: number; current?: number };
    } | null;
    libraryHealth?: {
        activeLibraries: number;
        concentrationPct: number;
        totalCatalogItems: number;
        totalCatalogBytes?: number;
        sizeGB: number;
        fourKPercent: number;
        catalogWatchedPct?: number;
        healthLabel: string;
        movies?: number;
        shows?: number;
        episodes?: number;
        artists?: number;
        albums?: number;
        tracks?: number;
        resolutions?: Record<string, number> | null;
        codecs?: Record<string, number> | null;
        fileSizes?: Record<string, any> | null;
        deltas?: any;
    };
    requestedPeriodDays?: string | number;
    cachePeriodDays?: string | number | null;
    cacheFallback?: boolean;
    jellystatInsights?: ProviderAnalytics | null;
};

export type ProviderAnalytics = {
    streamsRecord: number;
    transcodeRecord: number;
    directPlayRecord: number;
    directStreamRecord: number;
    totalPlays: number;
    tvPlays: number;
    moviePlays: number;
    musicPlays: number;
    totalTimeStr: string;
};

export const useAnalyticsData = ({
    days,
    isAdmin,
    isJellyfinPortal,
}: {
    days: string;
    isAdmin: boolean;
    isJellyfinPortal: boolean;
}) => {
    const [analyticsData, setAnalyticsData] = useState<AnalyticsData | null>(null);
    const [providerData, setProviderData] = useState<ProviderAnalytics | null>(null);
    const [isLoading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            setLoading(true);
            setError(null);
            try {
                const providerPromise = isAdmin && !isJellyfinPortal
                    ? apiFetch('/api/tautulli/stats').catch(() => null)
                    : null;
                const data = await apiFetch(`${isJellyfinPortal ? '/api/jellystat/analytics' : '/api/plex/analytics'}?days=${days}`);
                if (cancelled) return;
                setAnalyticsData(data);
                if (!isAdmin) {
                    setProviderData(null);
                    return;
                }
                const provider = isJellyfinPortal ? data.jellystatInsights : await providerPromise;
                if (!cancelled) setProviderData(provider || null);
            } catch (loadError) {
                if (!cancelled) setError(loadError instanceof Error ? loadError.message : 'Failed to load analytics');
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        load();
        return () => { cancelled = true; };
    }, [days, isAdmin, isJellyfinPortal]);

    return { analyticsData, providerData, isLoading, error };
};
