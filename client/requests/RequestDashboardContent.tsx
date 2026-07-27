import React from 'react';
import { cardSkeletons } from './requestDashboardConstants';
import { RequestMediaCard } from './RequestMediaCard';
import type { RequestMediaItem } from './types';

type RequestDashboardContentProps = {
    detailedContentTitle: string;
    items: RequestMediaItem[];
    includeExisting: boolean;
    refreshing: boolean;
    error: string | null;
    showSearchHint: boolean;
    showSkeleton: boolean;
    hasMore: boolean;
    loadingMore: boolean;
    requestingId: number | null;
    endpointBase: string;
    loadMoreRef: React.RefObject<HTMLDivElement | null>;
    onRefresh: () => void;
    onRetry: () => void;
    onOpen: (item: RequestMediaItem) => void;
    onRequest: (item: RequestMediaItem) => void;
    onNotify?: (item: RequestMediaItem) => void;
    onReportIssue: (item: RequestMediaItem) => void;
};

export const RequestDashboardContent: React.FC<RequestDashboardContentProps> = ({
    detailedContentTitle,
    items,
    includeExisting,
    refreshing,
    error,
    showSearchHint,
    showSkeleton,
    hasMore,
    loadingMore,
    requestingId,
    endpointBase,
    loadMoreRef,
    onRefresh,
    onRetry,
    onOpen,
    onRequest,
    onNotify,
    onReportIssue,
}) => (
    <section className="glass-card p-4 md:p-5 shadow-xl">
        <div className="flex items-center justify-between gap-3 mb-4">
            <div>
                <h2 className="text-xl font-black text-plex">
                    {detailedContentTitle}
                </h2>
                <p className="text-xs text-muted mt-1">
                    {refreshing
                        ? 'Refreshing...'
                        : `${items.length} title${items.length === 1 ? '' : 's'}${includeExisting ? ' · includes existing content' : ''}`}
                </p>
            </div>
            {endpointBase && (
                <button
                    type="button"
                    onClick={onRefresh}
                    className="text-xs font-semibold text-muted hover:text-text"
                >
                    Refresh
                </button>
            )}
        </div>

        {error && (
            <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
                <span>{items.length ? `${error}. Showing the most recent results.` : error}</span>
                <button type="button" onClick={onRetry} className="shrink-0 rounded-md border border-red-300/30 px-3 py-1.5 font-bold hover:bg-red-500/10">Retry</button>
            </div>
        )}

        {showSearchHint ? (
            <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted">Type at least two characters to search.</div>
        ) : showSkeleton ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3 md:gap-4">
                {cardSkeletons.map((index) => (
                    <div key={index} className="aspect-[2/3] rounded-xl bg-white/5 animate-pulse" />
                ))}
            </div>
        ) : items.length ? (
            <>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3 md:gap-4">
                    {items.map((item, index) => (
                        <RequestMediaCard
                            key={`${item.mediaType}-${item.tmdbId}`}
                            item={item}
                            busy={requestingId === item.tmdbId}
                            priority={index < 4}
                            onOpen={onOpen}
                            onRequest={onRequest}
                            onNotify={onNotify}
                            onReportIssue={onReportIssue}
                        />
                    ))}
                </div>
                {(hasMore || loadingMore) && <div ref={loadMoreRef} className="py-6 text-center text-xs font-semibold text-muted">{loadingMore ? 'Loading more titles...' : 'More titles load as you scroll'}</div>}
            </>
        ) : !error ? (
            <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted">No titles found.</div>
        ) : null}
    </section>
);
