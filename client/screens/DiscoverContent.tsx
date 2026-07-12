import React from 'react';

import { portalUrl, resolvePortalAssetUrl } from '../shared/basePath';
import { ScrollReveal } from '../shared/ui';
import { discoverPosterGridClass } from '../shared/portalLayout';

export const DiscoverPosterCard: React.FC<{
    item: { ratingKey?: string; title: string; thumb?: string; thumbUrl?: string; plexUrl: string; tags?: string[]; year?: number | string; parentTitle?: string };
    aspect?: '2/3' | 'square';
    overlay?: React.ReactNode;
    variant?: 'discover' | 'home';
    className?: string;
    footer?: React.ReactNode;
    showQualityBadges?: boolean;
    priority?: boolean;
}> = ({ item, aspect = '2/3', overlay, variant = 'discover', className = 'w-full', footer, showQualityBadges = true, priority = false }) => {
    const posterShell = variant === 'home'
        ? 'relative rounded-xl overflow-hidden bg-background border border-white/5 transition-[box-shadow,border-color] duration-300 group-hover:shadow-xl group-hover:border-plex/50'
        : 'relative rounded-lg overflow-hidden bg-background border border-border group-hover:border-plex transition-colors shadow-md';

    return (
        <a
            href={item.plexUrl}
            target="_blank"
            rel="noreferrer"
            className={`flex flex-col gap-2 group ${className}`}
            style={{ textDecoration: 'none', color: 'inherit' }}
        >
            <div className={`${posterShell} ${aspect === 'square' ? 'aspect-square' : 'aspect-[2/3]'} w-full`}>
                {item.thumb ? (
                    <img
                        src={item.thumbUrl ? resolvePortalAssetUrl(item.thumbUrl) : portalUrl(`/api/plex/image?path=${encodeURIComponent(item.thumb)}&width=300&height=${aspect === 'square' ? 300 : 450}`)}
                        alt={item.title}
                        loading={priority ? 'eager' : 'lazy'}
                        fetchPriority={priority ? 'high' : 'auto'}
                        decoding="async"
                        className={`w-full h-full object-cover ${variant === 'home' ? 'transition-[transform,opacity] duration-300 group-hover:scale-105 group-hover:opacity-80' : ''}`}
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center p-4 text-center bg-white/5">
                        <span className="text-xs font-bold text-muted line-clamp-3">{item.title}</span>
                    </div>
                )}
                {overlay}
                {showQualityBadges && item.tags && item.tags.length > 0 && (
                    <div className="absolute bottom-1 left-1 right-1 flex flex-wrap gap-0.5 pointer-events-none z-10">
                        {item.tags.map((tag) => (
                            <span key={tag} className="text-[8px] font-bold px-1 py-px rounded bg-black/85 text-white/95 border border-white/15 uppercase tracking-wide">
                                {tag}
                            </span>
                        ))}
                    </div>
                )}
            </div>
            {footer ?? (
                <div className={`text-xs font-medium line-clamp-2 leading-tight ${variant === 'home' ? 'text-text text-left px-1' : 'text-white text-center mt-1'}`}>
                    {item.title}
                </div>
            )}
        </a>
    );
};

const discoverViewsOverlay = (views: number) => (
    <div className="absolute top-2 right-2 bg-black/80 text-plex text-xs font-bold px-2 py-1 rounded backdrop-blur-md border border-plex/30 z-10 pointer-events-none">
        {views} Views
    </div>
);

export const DISCOVER_DESKTOP_ITEM_LIMIT = 20;
export const DISCOVER_MOBILE_ITEM_LIMIT = 12;
export const RECENTLY_ADDED_ITEM_LIMIT = 100;
export const DISCOVER_LIMIT_OPTIONS = [
    { value: '12', label: '12 Items' },
    { value: '20', label: '20 Items' },
    { value: '25', label: '25 Items' },
    { value: '50', label: '50 Items' },
];

export const TrendingDiscoverSection: React.FC<{ title: string; items: any[]; limit: number; showQualityBadges?: boolean; useScrollRevealAnimations?: boolean; preloadPosters?: boolean }> = ({ title, items, limit, showQualityBadges = true, useScrollRevealAnimations, preloadPosters = false }) => {
    if (!items?.length) return null;
    return (
        <ScrollReveal enabled={!!useScrollRevealAnimations} className="flex flex-col discover-deferred-section">
            <h3 className="text-plex text-sm uppercase tracking-[2px] mb-6 font-bold border-b border-white/10 pb-2">{title}</h3>
            <div className={discoverPosterGridClass}>
                {items.slice(0, limit).map((item, i) => (
                    <DiscoverPosterCard
                        key={item.ratingKey || `${item.title}-${i}`}
                        item={{ ...item, plexUrl: item.plexUrl || '#' }}
                        overlay={discoverViewsOverlay(item.views)}
                        showQualityBadges={showQualityBadges}
                        priority={preloadPosters && i < 8}
                    />
                ))}
            </div>
        </ScrollReveal>
    );
};
