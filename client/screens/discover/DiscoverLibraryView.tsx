import React from 'react';

import { CustomSelect, ScrollReveal } from '../../shared/ui';
import { discoverPosterGridClass } from '../../shared/portalLayout';
import { DiscoverDownloadsSection } from '../DiscoverDownloadsSection';
import { DISCOVER_LIMIT_OPTIONS, DiscoverPosterCard } from '../DiscoverContent';

type DiscoverLibraryData = {
    recentMovies: any[];
    recentShows: any[];
    recentMusic: any[];
};

const RecentSection: React.FC<{
    title: string;
    items: any[];
    limit: number;
    emptyLabel: string;
    aspect?: '2/3' | 'square';
    showQualityBadges: boolean;
    reveal?: boolean;
    preload?: boolean;
}> = ({ title, items, limit, emptyLabel, aspect = '2/3', showQualityBadges, reveal, preload }) => (
    <ScrollReveal enabled={!!reveal} className="flex flex-col discover-deferred-section">
        <h2 className="text-plex text-sm uppercase tracking-[2px] mb-5 font-bold border-b border-white/10 pb-2">{title}</h2>
        <div className={discoverPosterGridClass}>
            {items.slice(0, limit).map((item, index) => (
                <DiscoverPosterCard
                    key={item.ratingKey || `${item.title}-${index}`}
                    item={item}
                    aspect={aspect}
                    showQualityBadges={showQualityBadges}
                    priority={!!preload && index < 8}
                />
            ))}
            {!items.length && <div className="col-span-full rounded-xl border border-dashed border-border p-8 text-center text-muted">{emptyLabel}</div>}
        </div>
    </ScrollReveal>
);

export const DiscoverLibraryView: React.FC<{
    data: DiscoverLibraryData;
    recentLimit: number;
    onRecentLimitChange: (value: string) => void;
    isJellyfinPortal: boolean;
    showQualityBadges: boolean;
    useScrollRevealAnimations?: boolean;
}> = ({ data, recentLimit, onRecentLimitChange, isJellyfinPortal, showQualityBadges, useScrollRevealAnimations }) => (
    <div className="flex w-full flex-col gap-10">
        <div className="flex items-center justify-end gap-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted">Items per section</span>
            <CustomSelect
                compact
                className="w-32"
                value={String(recentLimit)}
                onChange={onRecentLimitChange}
                options={DISCOVER_LIMIT_OPTIONS}
            />
        </div>

        {!isJellyfinPortal && <DiscoverDownloadsSection useScrollRevealAnimations={useScrollRevealAnimations} />}

        <RecentSection
            title="Recently Added Movies"
            items={data.recentMovies}
            limit={recentLimit}
            emptyLabel="No recent movies"
            showQualityBadges={showQualityBadges}
            reveal={useScrollRevealAnimations}
        />
        <RecentSection
            title={isJellyfinPortal ? 'Recently Added Episodes' : 'Recently Added TV Shows'}
            items={data.recentShows}
            limit={recentLimit}
            emptyLabel={isJellyfinPortal ? 'No recent episodes' : 'No recent TV shows'}
            showQualityBadges={showQualityBadges}
            reveal={useScrollRevealAnimations}
        />
        <RecentSection
            title="Recently Added Music"
            items={data.recentMusic}
            limit={recentLimit}
            emptyLabel="No recent music"
            aspect="square"
            showQualityBadges={showQualityBadges}
            reveal={useScrollRevealAnimations}
        />
    </div>
);
