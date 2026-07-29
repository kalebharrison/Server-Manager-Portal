import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { RecentlyAddedWidgetId } from '../shared/dashboardLayout';
import { ScrollReveal } from '../shared/ui';
import type { RecentlyAddedWidgetDeps } from './userDashboardWidgetTypes';

/** Cap posters per rail — 80 DOM nodes with blur was making Home scroll feel laggy. */
const HOME_RAIL_POSTER_LIMIT = 24;

const RecentlyAddedScrollRow: React.FC<{ title: string; children: React.ReactNode; headerRight?: React.ReactNode }> = ({ title, children, headerRight }) => {
    const scrollRef = useRef<HTMLDivElement>(null);
    const canLeftRef = useRef(false);
    const canRightRef = useRef(false);
    const rafRef = useRef(0);
    const [canScrollLeft, setCanScrollLeft] = useState(false);
    const [canScrollRight, setCanScrollRight] = useState(false);

    const syncEdges = useCallback(() => {
        const el = scrollRef.current;
        if (!el) return;
        const maxScroll = el.scrollWidth - el.clientWidth;
        const nextLeft = el.scrollLeft > 4;
        const nextRight = el.scrollLeft < maxScroll - 4;
        if (nextLeft !== canLeftRef.current) {
            canLeftRef.current = nextLeft;
            setCanScrollLeft(nextLeft);
        }
        if (nextRight !== canRightRef.current) {
            canRightRef.current = nextRight;
            setCanScrollRight(nextRight);
        }
    }, []);

    const updateScrollState = useCallback(() => {
        if (rafRef.current) return;
        rafRef.current = window.requestAnimationFrame(() => {
            rafRef.current = 0;
            syncEdges();
        });
    }, [syncEdges]);

    useEffect(() => {
        syncEdges();
        const el = scrollRef.current;
        if (!el) return;
        el.addEventListener('scroll', updateScrollState, { passive: true });
        const ro = new ResizeObserver(syncEdges);
        ro.observe(el);
        return () => {
            el.removeEventListener('scroll', updateScrollState);
            ro.disconnect();
            if (rafRef.current) window.cancelAnimationFrame(rafRef.current);
        };
    }, [updateScrollState, syncEdges, children]);

    const scroll = (direction: -1 | 1) => {
        const el = scrollRef.current;
        if (!el) return;
        el.scrollBy({ left: direction * el.clientWidth * 0.85, behavior: 'smooth' });
    };

    return (
        <div className="poster-rail-panel p-4 md:p-5 overflow-hidden w-full">
            <div className="flex items-center justify-between gap-3 mb-3">
                <h3 className="text-lg md:text-xl font-bold text-text">{title}</h3>
                {headerRight}
            </div>
            <div className="relative">
                <button
                    type="button"
                    onClick={() => scroll(-1)}
                    disabled={!canScrollLeft}
                    aria-label={`Scroll ${title} left`}
                    className="hidden lg:flex absolute left-0 top-1/2 -translate-y-1/2 z-10 h-10 w-10 items-center justify-center rounded-full bg-black/70 border border-white/10 text-text hover:bg-black/90 hover:border-plex/50 disabled:opacity-0 disabled:pointer-events-none transition-colors shadow-lg -ml-1"
                >
                    <ChevronLeft className="w-5 h-5" />
                </button>
                <div
                    ref={scrollRef}
                    className="flex overflow-x-auto gap-4 pb-4 snap-x snap-proximity hide-scrollbar poster-rail-scroll lg:px-1"
                >
                    {children}
                </div>
                <button
                    type="button"
                    onClick={() => scroll(1)}
                    disabled={!canScrollRight}
                    aria-label={`Scroll ${title} right`}
                    className="hidden lg:flex absolute right-0 top-1/2 -translate-y-1/2 z-10 h-10 w-10 items-center justify-center rounded-full bg-black/70 border border-white/10 text-text hover:bg-black/90 hover:border-plex/50 disabled:opacity-0 disabled:pointer-events-none transition-colors shadow-lg -mr-1"
                >
                    <ChevronRight className="w-5 h-5" />
                </button>
            </div>
        </div>
    );
};

export { RecentlyAddedScrollRow };

export const createRecentlyAddedWidgetRenderer = (deps: RecentlyAddedWidgetDeps) => {
    const { dashboardData, showQualityBadges, DiscoverPosterCard, publicConfig } = deps;

    return (id: RecentlyAddedWidgetId): React.ReactNode => {
        if (!dashboardData) return null;
        switch (id) {
            case 'recentMovies':
                if (!dashboardData.recentMovies?.length) return null;
                return (
                    <ScrollReveal enabled={!!publicConfig?.useScrollRevealAnimations}>
                        <RecentlyAddedScrollRow title="Recently Added Movies">
                        {dashboardData.recentMovies.slice(0, HOME_RAIL_POSTER_LIMIT).map((item: any, idx: number) => (
                            <DiscoverPosterCard
                                key={item.ratingKey || item.sourceRatingKey || `${item.title}-${idx}`}
                                variant="home"
                                className="snap-start shrink-0 w-32 md:w-40 poster-rail-item"
                                item={item}
                                showQualityBadges={showQualityBadges}
                                footer={(
                                    <div className="flex flex-col px-1">
                                        <p className="text-xs font-bold text-text truncate group-hover:text-plex transition-colors">{item.title}</p>
                                        {item.year && <p className="text-[10px] text-muted font-semibold mt-0.5">{item.year}</p>}
                                    </div>
                                )}
                            />
                        ))}
                    </RecentlyAddedScrollRow>
                    </ScrollReveal>
                );
            case 'recentShows':
                if (!dashboardData.recentShows?.length) return null;
                return (
                    <ScrollReveal enabled={!!publicConfig?.useScrollRevealAnimations}>
                        <RecentlyAddedScrollRow title="Recently Added TV Shows">
                        {dashboardData.recentShows.slice(0, HOME_RAIL_POSTER_LIMIT).map((item: any, idx: number) => (
                            <DiscoverPosterCard
                                key={item.ratingKey || item.sourceRatingKey || `${item.title}-${idx}`}
                                variant="home"
                                className="snap-start shrink-0 w-32 md:w-40 poster-rail-item"
                                item={item}
                                showQualityBadges={showQualityBadges}
                                footer={(
                                    <div className="flex flex-col px-1">
                                        <p className="text-xs font-bold text-text truncate group-hover:text-plex transition-colors">{item.title}</p>
                                        {item.year && <p className="text-[10px] text-muted font-semibold mt-0.5">{item.year}</p>}
                                    </div>
                                )}
                            />
                        ))}
                    </RecentlyAddedScrollRow>
                    </ScrollReveal>
                );
            case 'recentMusic':
                if (!dashboardData.recentMusic?.length) return null;
                return (
                    <ScrollReveal enabled={!!publicConfig?.useScrollRevealAnimations}>
                        <RecentlyAddedScrollRow title="Recently Added Music">
                        {dashboardData.recentMusic.slice(0, HOME_RAIL_POSTER_LIMIT).map((item: any, idx: number) => (
                            <DiscoverPosterCard
                                key={item.ratingKey || item.sourceRatingKey || `${item.title}-${idx}`}
                                variant="home"
                                aspect="square"
                                className="snap-start shrink-0 w-32 md:w-40 poster-rail-item"
                                item={item}
                                showQualityBadges={showQualityBadges}
                                footer={(
                                    <div className="flex flex-col px-1">
                                        <p className="text-xs font-bold text-text truncate group-hover:text-plex transition-colors">{item.title}</p>
                                        {item.parentTitle && <p className="text-[10px] text-muted font-semibold mt-0.5 truncate">{item.parentTitle}</p>}
                                    </div>
                                )}
                            />
                        ))}
                    </RecentlyAddedScrollRow>
                    </ScrollReveal>
                );
            default:
                return null;
        }
    };
};
