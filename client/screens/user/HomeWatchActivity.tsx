import React, { Suspense, lazy, memo, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronUp, Clock, PlaySquare } from 'lucide-react';

import { prefetchImages } from '../../shared/prefetchImages';
import { resolveHomePosterImage } from './userDashboardUtils';

const ReportIssueModal = lazy(() => import('../ReportIssueModal').then(module => ({ default: module.ReportIssueModal })));

type Props = {
    analytics: any;
    analyticsLoading: boolean;
    canShowAnalytics: boolean;
    recentHistoryRows?: number;
    topWatchedRows?: number;
};

const posterSrcForItem = (item: any, width = 300, height = 450) => resolveHomePosterImage(item, width, height);

const PageControls: React.FC<{
    page: number;
    pageCount: number;
    onPageChange: (page: number) => void;
}> = ({ page, pageCount, onPageChange }) => (
    <div className="flex items-center gap-2">
        <button
            onClick={() => onPageChange(Math.max(0, page - 1))}
            disabled={page === 0}
            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-text"
        >
            <ChevronUp className="w-4 h-4 -rotate-90" />
        </button>
        <span className="text-xs text-muted font-medium w-8 text-center">{page + 1} / {pageCount}</span>
        <button
            onClick={() => onPageChange(Math.min(pageCount - 1, page + 1))}
            disabled={page >= pageCount - 1}
            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-text"
        >
            <ChevronDown className="w-4 h-4 -rotate-90" />
        </button>
    </div>
);

export const HomeWatchActivity = memo<Props>(({ analytics, analyticsLoading, canShowAnalytics, recentHistoryRows = 7, topWatchedRows = 2 }) => {
    const [recentPage, setRecentPage] = useState(0);
    const [topPage, setTopPage] = useState(0);
    const [reportItem, setReportItem] = useState<any>(null);
    const recentPageSize = recentHistoryRows * 2;
    const topPageSize = topWatchedRows * 6;
    const recentItems = analytics?.recentHistory || [];
    const topItems = analytics?.topWatched || [];
    const recentPageCount = Math.max(1, Math.ceil(recentItems.length / recentPageSize));
    const topPageCount = Math.max(1, Math.ceil(topItems.length / topPageSize));

    useEffect(() => {
        setRecentPage(0);
        setTopPage(0);
    }, [analytics]);
    useEffect(() => setRecentPage(current => Math.min(current, recentPageCount - 1)), [recentPageCount]);
    useEffect(() => setTopPage(current => Math.min(current, topPageCount - 1)), [topPageCount]);

    const visibleRecentItems = useMemo(
        () => recentItems.slice(recentPage * recentPageSize, (recentPage + 1) * recentPageSize),
        [recentItems, recentPage, recentPageSize],
    );
    const visibleTopItems = useMemo(
        () => topItems.slice(topPage * topPageSize, (topPage + 1) * topPageSize),
        [topItems, topPage, topPageSize],
    );

    useEffect(() => {
        const nextRecent = recentItems.slice((recentPage + 1) * recentPageSize, (recentPage + 2) * recentPageSize);
        const nextTop = topItems.slice((topPage + 1) * topPageSize, (topPage + 2) * topPageSize);
        prefetchImages([
            ...visibleRecentItems.map((item: any) => posterSrcForItem(item, 128, 128)),
            ...visibleTopItems.map((item: any) => posterSrcForItem(item, 300, 450)),
            ...nextRecent.map((item: any) => posterSrcForItem(item, 128, 128)),
            ...nextTop.map((item: any) => posterSrcForItem(item, 300, 450)),
        ], 36);
    }, [visibleRecentItems, visibleTopItems, recentItems, topItems, recentPage, topPage, recentPageSize, topPageSize]);

    if (!canShowAnalytics) return null;

    return (
        <>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 md:gap-4 items-stretch">
                {!analyticsLoading && recentItems.length > 0 && (
                    <div className="lg:col-span-1 flex min-h-0">
                        <div className="glass-card p-4 md:p-5 shadow-xl flex flex-col h-full w-full min-h-0">
                            <div className="flex items-center justify-between mb-3 md:mb-4 flex-shrink-0">
                                <h3 className="text-lg md:text-xl font-bold text-text">Recently Watched</h3>
                                {recentItems.length > recentPageSize && <PageControls page={recentPage} pageCount={recentPageCount} onPageChange={setRecentPage} />}
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 items-stretch flex-1 min-h-0 content-start">
                                {visibleRecentItems.map((item: any, index: number) => {
                                    const posterSrc = posterSrcForItem(item, 128, 128);
                                    return (
                                    <div key={item.historyKey || `${item.type}-${item.title}-${index}`} className="flex items-center self-stretch gap-3 p-2 bg-black/20 rounded-xl border border-white/5 hover:border-plex/50 hover:bg-black/40 hover:shadow-[0_0_15px_rgba(229,160,13,0.15)] transition-all group relative">
                                        <a href={item.plexUrl} target="_blank" rel="noreferrer" className="flex items-center flex-1 min-w-0 gap-3">
                                            <div className="w-10 h-10 rounded-lg overflow-hidden bg-background flex-shrink-0 shadow-md">
                                                {posterSrc ? (
                                                    <img src={posterSrc} alt={item.title} className="w-full h-full object-cover" loading={index < 6 ? 'eager' : 'lazy'} decoding="async" fetchPriority={index < 4 ? 'high' : 'auto'} />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center"><PlaySquare className="w-5 h-5 text-muted/50" /></div>
                                                )}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <h4 className="font-bold text-text text-sm truncate group-hover:text-plex transition-colors">{item.title}</h4>
                                                {item.episodeTitle && <p className="text-xs text-muted truncate mt-0.5">{item.episodeTitle}</p>}
                                                <div className="flex items-center gap-1 mt-1">
                                                    <Clock className="w-3 h-3 text-muted" />
                                                    <p className="text-[10px] text-muted">{new Date(item.viewedAt * 1000).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</p>
                                                </div>
                                            </div>
                                        </a>
                                        <button
                                            onClick={(event) => { event.preventDefault(); setReportItem(item); }}
                                            className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 p-2 text-muted hover:text-red-400 hover:bg-red-400/10 rounded-full transition-all focus:outline-none"
                                            title="Report a playback issue"
                                        >
                                            <AlertTriangle className="w-4 h-4" />
                                        </button>
                                    </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                )}
                {!analyticsLoading && analytics && analytics.totalPlays > 0 && topItems.length > 0 ? (
                    <div className={`flex min-h-0 ${recentItems.length ? 'lg:col-span-2' : 'lg:col-span-2 lg:col-start-2'}`}>
                        <div className="glass-card p-4 md:p-5 shadow-xl flex flex-col h-full w-full min-h-0">
                            <div className="flex items-center justify-between mb-3 md:mb-4 flex-shrink-0">
                                <div>
                                    <h3 className="text-lg md:text-xl font-bold text-text mb-0.5">Your Most Watched</h3>
                                    <p className="text-muted text-sm">Based on your {analytics.totalPlays} total plays</p>
                                </div>
                                {topItems.length > topPageSize && <PageControls page={topPage} pageCount={topPageCount} onPageChange={setTopPage} />}
                            </div>
                            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2.5 md:gap-3.5 flex-1 min-h-0 content-start">
                                {visibleTopItems.map((item: any, index: number) => {
                                    const posterSrc = posterSrcForItem(item, 300, 450);
                                    return (
                                    <a key={item.key} href={item.plexUrl} target="_blank" rel="noreferrer" className="group flex flex-col gap-1.5">
                                        <div className="relative rounded-lg overflow-hidden aspect-[2/3] bg-background border border-white/5 transition-[box-shadow,border-color] duration-300 group-hover:shadow-xl group-hover:border-plex/50">
                                            {posterSrc ? (
                                                <img src={posterSrc} alt={item.title} className="w-full h-full object-cover transition-[transform,opacity] duration-300 group-hover:scale-105 group-hover:opacity-80" loading={index < 8 ? 'eager' : 'lazy'} decoding="async" fetchPriority={index < 6 ? 'high' : 'auto'} />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center p-4 text-center bg-white/5"><span className="text-xs font-bold text-muted line-clamp-3">{item.title}</span></div>
                                            )}
                                        </div>
                                        <div className="flex flex-col px-0.5">
                                            <p className="text-xs sm:text-sm font-bold text-text truncate group-hover:text-plex transition-colors">{item.title}</p>
                                            <p className="text-[10px] sm:text-xs text-plex font-black mt-0.5 uppercase tracking-wider">{item.plays} plays</p>
                                        </div>
                                    </a>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                ) : null}
            </div>

            {reportItem && (
                <Suspense fallback={null}>
                    <ReportIssueModal item={reportItem} onClose={() => setReportItem(null)} />
                </Suspense>
            )}
        </>
    );
});

HomeWatchActivity.displayName = 'HomeWatchActivity';
