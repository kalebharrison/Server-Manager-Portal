import React from 'react';

import { TrendingDiscoverSection } from '../DiscoverContent';
import { buildRailBrowsePath, type DiscoverRailId } from '../../discovery/discoverRailBrowse';

export const DiscoverCommunityView: React.FC<{
    trendingStats: { trending7Days: any[]; movies30Days: any[]; shows30Days: any[] } | null;
    recentLimit: number;
    showQualityBadges: boolean;
    serverName?: string;
    isJellyfinPortal: boolean;
    navigate?: (path: string) => void;
}> = ({ trendingStats, recentLimit, showQualityBadges, serverName, isJellyfinPortal, navigate }) => {
    const browse = (railId: DiscoverRailId) => {
        if (!navigate) return undefined;
        return () => navigate(buildRailBrowsePath('/discovery', railId, 'all'));
    };

    return (
        <div className="flex w-full flex-col gap-6 px-1 pb-8">
            {isJellyfinPortal ? (
                <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted">
                    Community trending is available when this portal is connected to Plex analytics.
                </div>
            ) : trendingStats ? (
                <section className="flex w-full flex-col gap-6">
                    <div className="px-2">
                        <h2 className="text-xl font-extrabold text-white md:text-2xl">Community activity on {serverName || 'this server'}</h2>
                        <p className="mt-1 text-sm text-muted">What the community has been watching recently.</p>
                    </div>
                    <TrendingDiscoverSection
                        title="Trending This Week"
                        items={trendingStats.trending7Days}
                        limit={recentLimit}
                        showQualityBadges={showQualityBadges}
                        preloadPosters
                        viewAllLabel="View All"
                        onBrowseRail={browse('community-trending')}
                    />
                    <TrendingDiscoverSection
                        title="Most Watched Movies This Month"
                        items={trendingStats.movies30Days}
                        limit={recentLimit}
                        showQualityBadges={showQualityBadges}
                        viewAllLabel="View All"
                        onBrowseRail={browse('community-movies')}
                    />
                    <TrendingDiscoverSection
                        title="Most Watched Shows This Month"
                        items={trendingStats.shows30Days}
                        limit={recentLimit}
                        showQualityBadges={showQualityBadges}
                        viewAllLabel="View All"
                        onBrowseRail={browse('community-shows')}
                    />
                </section>
            ) : (
                <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted">
                    No community activity yet. Check back after people start watching.
                </div>
            )}
        </div>
    );
};
