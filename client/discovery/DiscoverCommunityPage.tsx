import React, { useCallback, useEffect, useState } from 'react';

import { apiFetch } from '../shared/api';
import { cacheRefreshMs } from '../shared/cacheRefresh';
import { useVisibleInterval } from '../shared/useVisibleInterval';
import { DiscoverCommunityView } from '../screens/discover/DiscoverCommunityView';
import { DISCOVER_DESKTOP_ITEM_LIMIT } from '../screens/DiscoverContent';

type TrendingStats = { trending7Days: any[]; movies30Days: any[]; shows30Days: any[] };

export const DiscoverCommunityPage: React.FC<{
    navigate?: (path: string) => void;
    mediaServerType?: string;
    serverName?: string;
    showPosterQualityBadges?: boolean;
}> = ({
    navigate,
    mediaServerType = 'plex',
    serverName,
    showPosterQualityBadges = false,
}) => {
    const isJellyfinPortal = String(mediaServerType || '').toLowerCase() === 'jellyfin';
    const refreshMs = cacheRefreshMs({ cacheRefreshMinutes: 5 });
    const [trendingStats, setTrendingStats] = useState<TrendingStats | null>(null);
    const [loading, setLoading] = useState(!isJellyfinPortal);

    const fetchTrending = useCallback(async () => {
        if (isJellyfinPortal) {
            setLoading(false);
            return;
        }
        try {
            const result = await apiFetch('/api/plex/stats/trending', {
                cacheTtlMs: refreshMs,
                staleIfErrorMs: 60 * 60_000,
            });
            setTrendingStats(result || null);
        } catch {
            // Keep last snapshot if a refresh fails.
        } finally {
            setLoading(false);
        }
    }, [isJellyfinPortal, refreshMs]);

    useEffect(() => {
        void fetchTrending();
    }, [fetchTrending]);

    useVisibleInterval(fetchTrending, isJellyfinPortal ? null : refreshMs);

    if (loading && !trendingStats) {
        return (
            <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted">
                Loading community activity…
            </div>
        );
    }

    return (
        <DiscoverCommunityView
            trendingStats={trendingStats}
            recentLimit={DISCOVER_DESKTOP_ITEM_LIMIT}
            showQualityBadges={showPosterQualityBadges}
            serverName={serverName}
            isJellyfinPortal={isJellyfinPortal}
            navigate={navigate}
        />
    );
};
