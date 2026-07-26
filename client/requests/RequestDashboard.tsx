import React from 'react';
import { AlertTriangle, Search, Sparkles } from 'lucide-react';
import { ToastContainer } from '../shared/toast';
import { AdminRequestQueue } from './AdminRequestQueue';
import { RequestDashboardContent } from './RequestDashboardContent';
import { RequestDashboardFilters } from './RequestDashboardFilters';
import { RequestMediaModal } from './RequestMediaModal';
import { useRequestDashboard } from './useRequestDashboard';

export const RequestDashboard: React.FC<{ isAdmin: boolean; cacheMinutes?: number }> = ({ isAdmin, cacheMinutes }) => {
    const dashboard = useRequestDashboard(cacheMinutes);

    return (
        <div className="w-full animate-fade-in space-y-6">
            <ToastContainer toasts={dashboard.toasts} setToasts={dashboard.setToasts} />

            <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-card shadow-2xl p-5 md:p-7">
                <div className="absolute inset-0 bg-gradient-to-br from-plex/15 via-transparent to-transparent opacity-70" aria-hidden />
                <div className="relative z-10 flex flex-col lg:flex-row lg:items-end lg:justify-between gap-5">
                    <div>
                        <div className="flex items-center gap-2 text-plex mb-2">
                            <Sparkles className="w-5 h-5" />
                            <span className="text-xs font-black uppercase tracking-[0.25em]">Requests</span>
                        </div>
                        <h1 className="text-3xl md:text-5xl font-black text-text tracking-tight">Request Content</h1>
                        <p className="text-sm text-muted mt-2 max-w-2xl">
                            Browse or search titles to request. Use Ask Requesty (bottom-right) anytime while you navigate.
                        </p>
                    </div>
                    <div className="relative w-full lg:w-[28rem]">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted" />
                        <input
                            value={dashboard.query}
                            onChange={(event) => { dashboard.setQuery(event.target.value); dashboard.setActiveView('search'); }}
                            placeholder="Search movies and shows"
                            className="w-full h-12 pl-12 pr-4 rounded-xl border border-border bg-background/80 text-text outline-none focus:border-plex focus:ring-1 focus:ring-plex transition-all"
                        />
                    </div>
                </div>
            </div>

            {dashboard.statusLoading ? (
                <div className="glass-card p-5 shadow-xl">
                    <div className="h-5 w-48 bg-white/10 rounded animate-pulse mb-3" />
                    <div className="h-4 w-full max-w-xl bg-white/5 rounded animate-pulse" />
                </div>
            ) : !dashboard.ready ? (
                <div className="glass-card p-5 border-yellow-500/30">
                    <div className="flex gap-3">
                        <AlertTriangle className="w-5 h-5 text-yellow-300 shrink-0 mt-0.5" />
                        <div>
                            <h2 className="font-bold text-text">Request app is not ready</h2>
                            <p className="text-sm text-muted mt-1">{dashboard.status?.error || 'Configure Seerr or Jellyseerr in Settings > Integrations.'}</p>
                        </div>
                    </div>
                </div>
            ) : (
                <>
                    <RequestDashboardFilters
                        isAdmin={isAdmin}
                        activeView={dashboard.activeView}
                        browseCategory={dashboard.browseCategory}
                        mediaFilter={dashboard.mediaFilter}
                        animeOnly={dashboard.animeOnly}
                        foreignOnly={dashboard.foreignOnly}
                        genreId={dashboard.genreId}
                        includeExisting={dashboard.includeExisting}
                        onActiveViewChange={dashboard.setActiveView}
                        onBrowseCategoryChange={dashboard.setBrowseCategory}
                        onMediaFilterChange={(filter) => {
                            dashboard.setMediaFilter(filter);
                            dashboard.saveRequestDefault({ requestMediaType: filter });
                        }}
                        onAnimeOnlyToggle={() => dashboard.setAnimeOnly((value) => !value)}
                        onForeignOnlyToggle={() => dashboard.setForeignOnly((value) => !value)}
                        onGenreIdChange={dashboard.setGenreId}
                        onIncludeExistingToggle={() => dashboard.setIncludeExisting((value) => {
                            const next = !value;
                            dashboard.saveRequestDefault({ requestIncludeExisting: next });
                            return next;
                        })}
                    />

                    {dashboard.activeView === 'queue' ? (
                        <AdminRequestQueue />
                    ) : (
                        <RequestDashboardContent
                            detailedContentTitle={dashboard.detailedContentTitle}
                            items={dashboard.items}
                            includeExisting={dashboard.includeExisting}
                            refreshing={dashboard.refreshing}
                            error={dashboard.error}
                            showSearchHint={dashboard.showSearchHint}
                            showSkeleton={dashboard.showSkeleton}
                            hasMore={dashboard.hasMore}
                            loadingMore={dashboard.loadingMore}
                            requestingId={dashboard.requestingId}
                            endpointBase={dashboard.endpointBase}
                            loadMoreRef={dashboard.loadMoreRef}
                            onRefresh={() => dashboard.loadItems({ silent: true })}
                            onRetry={() => dashboard.loadItems()}
                            onOpen={dashboard.openDetails}
                            onRequest={dashboard.requestFromCard}
                            onReportIssue={dashboard.openIssue}
                        />
                    )}
                </>
            )}

            {dashboard.selectedItem && (
                <RequestMediaModal
                    item={dashboard.selectedItem}
                    saving={dashboard.requestingId === dashboard.selectedItem.tmdbId}
                    onClose={() => { dashboard.setSelectedItem(null); dashboard.setOpenIssueOnSelect(false); }}
                    onSubmit={dashboard.submitRequest}
                    initialIssueForm={dashboard.openIssueOnSelect}
                />
            )}
        </div>
    );
};
