import React from 'react';

import { TrendingDiscoverSection } from '../DiscoverContent';

export const DiscoverCommunityView: React.FC<{
    trendingStats: { trending7Days: any[]; movies30Days: any[]; shows30Days: any[] } | null;
    recentLimit: number;
    showQualityBadges: boolean;
    useScrollRevealAnimations?: boolean;
    serverName?: string;
    isJellyfinPortal: boolean;
}> = ({ trendingStats, recentLimit, showQualityBadges, useScrollRevealAnimations, serverName, isJellyfinPortal }) => (
    <div className="flex w-full flex-col gap-10">
        {!isJellyfinPortal && trendingStats ? (
            <section className="flex w-full flex-col gap-10">
                <div className="text-center">
                    <h2 className="text-2xl font-extrabold text-white md:text-3xl">Community activity on {serverName || 'this server'}</h2>
                    <p className="mt-2 text-sm text-muted">What the community has been watching recently.</p>
                </div>
                <TrendingDiscoverSection title="Trending This Week" items={trendingStats.trending7Days} limit={recentLimit} showQualityBadges={showQualityBadges} useScrollRevealAnimations={useScrollRevealAnimations} preloadPosters />
                <TrendingDiscoverSection title="Most Watched Movies This Month" items={trendingStats.movies30Days} limit={recentLimit} showQualityBadges={showQualityBadges} useScrollRevealAnimations={useScrollRevealAnimations} />
                <TrendingDiscoverSection title="Most Watched Shows This Month" items={trendingStats.shows30Days} limit={recentLimit} showQualityBadges={showQualityBadges} useScrollRevealAnimations={useScrollRevealAnimations} />
            </section>
        ) : null}
    </div>
);
