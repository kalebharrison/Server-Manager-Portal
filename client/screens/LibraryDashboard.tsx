import React, { useCallback, useEffect, useRef, useState } from 'react';

import { apiFetch } from '../shared/api';
import { DiscoverPageSkeleton } from '../shared/skeletons';
import { usePortalWideContentLayout } from '../shared/portalLayout';
import { useVisibleInterval } from '../shared/useVisibleInterval';
import { DiscoverCommunityView } from './discover/DiscoverCommunityView';
import { DiscoverLibraryView } from './discover/DiscoverLibraryView';
import { StreamDetailsModal } from './StreamDetailsModal';
import { DISCOVER_DESKTOP_ITEM_LIMIT, DISCOVER_MOBILE_ITEM_LIMIT } from './DiscoverContent';

type DiscoverView = 'library' | 'community';
type DashboardData = {
    activeSessions: any[];
    recentMovies: any[];
    recentShows: any[];
    recentMusic: any[];
};
type TrendingStats = {
    trending7Days: any[];
    movies30Days: any[];
    shows30Days: any[];
};

const viewOptions: Array<{ id: DiscoverView; label: string; description: string }> = [
    { id: 'library', label: 'Library', description: 'Downloads and recently added content' },
    { id: 'community', label: 'Community', description: 'Current streams and viewing trends' },
];

export const LibraryDashboard: React.FC<{ onBack: () => void; isAdmin?: boolean; publicConfig?: any; mediaServerType?: string }> = ({ isAdmin, publicConfig, mediaServerType }) => {
    const [activeView, setActiveView] = useState<DiscoverView>('library');
    const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
    const [trendingStats, setTrendingStats] = useState<TrendingStats | null>(null);
    const [dashboardLoading, setDashboardLoading] = useState(true);
    const [trendingLoading, setTrendingLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [pollError, setPollError] = useState<string | null>(null);
    const [selectedSession, setSelectedSession] = useState<any | null>(null);
    const isWidePortalLayout = usePortalWideContentLayout();
    const [isDiscoverDesktop, setIsDiscoverDesktop] = useState(() => typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches);
    const [recentLimitOverride, setRecentLimitOverride] = useState<number | null>(() => {
        const saved = localStorage.getItem('discoverRecentLimitOverride');
        return saved ? Math.min(50, Math.max(12, Number(saved) || 20)) : null;
    });
    const hasLoadedDashboard = useRef(false);
    const recentLimit = recentLimitOverride ?? (isDiscoverDesktop ? DISCOVER_DESKTOP_ITEM_LIMIT : DISCOVER_MOBILE_ITEM_LIMIT);
    const showQualityBadges = publicConfig?.showPosterQualityBadges !== false;
    const isJellyfinPortal = String(publicConfig?.mediaServerType || mediaServerType || 'plex').toLowerCase() === 'jellyfin';

    useEffect(() => {
        const mediaQuery = window.matchMedia('(min-width: 1024px)');
        const handleChange = (event: MediaQueryListEvent) => setIsDiscoverDesktop(event.matches);
        mediaQuery.addEventListener('change', handleChange);
        return () => mediaQuery.removeEventListener('change', handleChange);
    }, []);

    const handleRecentLimitChange = useCallback((value: string) => {
        const next = Math.min(50, Math.max(12, Number(value) || 20));
        setRecentLimitOverride(next);
        localStorage.setItem('discoverRecentLimitOverride', String(next));
        localStorage.removeItem('discoverRecentLimit');
    }, []);

    const fetchDashboardOnly = useCallback(async () => {
        try {
            const result = await apiFetch(`${isJellyfinPortal ? '/api/jellyfin/dashboard' : '/api/plex/dashboard'}?limit=${recentLimit}`, { cacheTtlMs: activeView === 'community' ? 5_000 : 30_000 });
            if (result.error) throw new Error(result.error);
            setDashboardData(result);
            setPollError(null);
        } catch (fetchError: any) {
            setPollError(fetchError?.message || 'Discover update failed');
        }
    }, [activeView, isJellyfinPortal, recentLimit]);

    const fetchDashboard = useCallback(async () => {
        setError(null);
        if (!hasLoadedDashboard.current) setDashboardLoading(true);
        try {
            const result = await apiFetch(`${isJellyfinPortal ? '/api/jellyfin/dashboard' : '/api/plex/dashboard'}?limit=${recentLimit}`, { cacheTtlMs: 30_000 });
            if (result.error) throw new Error(result.error);
            setDashboardData(result);
        } catch (fetchError: any) {
            setError(fetchError?.message || 'Failed to load Discover');
        } finally {
            hasLoadedDashboard.current = true;
            setDashboardLoading(false);
        }
    }, [isJellyfinPortal, recentLimit]);

    const fetchTrending = useCallback(async () => {
        if (isJellyfinPortal || trendingStats) return;
        setTrendingLoading(true);
        try {
            const result = await apiFetch('/api/plex/stats/trending', { cacheTtlMs: 60_000, staleIfErrorMs: 10 * 60_000 });
            if (result.error) throw new Error(result.error);
            setTrendingStats(result);
        } catch (fetchError: any) {
            setPollError(fetchError?.message || 'Community activity is temporarily unavailable');
        } finally {
            setTrendingLoading(false);
        }
    }, [isJellyfinPortal, trendingStats]);

    useEffect(() => { void fetchDashboard(); }, [fetchDashboard]);
    useEffect(() => {
        if (activeView === 'community') void fetchTrending();
    }, [activeView, fetchTrending]);
    useVisibleInterval(fetchDashboardOnly, activeView === 'community' ? 10_000 : 60_000);

    if (dashboardLoading && !dashboardData) return <DiscoverPageSkeleton recentLimit={recentLimit} />;

    return (
        <div className="flex min-h-screen w-full flex-col">
            <main className="discover-layout-container mt-4 w-full pb-8 md:mt-0">
                {error && <div className="toast error show">{error}</div>}
                {pollError && !error && <div className="toast error show">{pollError}</div>}

                <div className="mb-8 flex w-full max-w-xl rounded-lg border border-border bg-card/70 p-1" role="tablist" aria-label="Discover sections">
                    {viewOptions.map((option) => (
                        <button
                            key={option.id}
                            type="button"
                            role="tab"
                            aria-selected={activeView === option.id}
                            onClick={() => setActiveView(option.id)}
                            className={`min-w-0 flex-1 rounded-md px-4 py-2 text-left transition-colors ${activeView === option.id ? 'bg-plex text-background' : 'text-muted hover:bg-white/5 hover:text-text'}`}
                        >
                            <span className="block text-sm font-bold">{option.label}</span>
                            <span className={`hidden text-[10px] sm:block ${activeView === option.id ? 'text-background/70' : 'text-muted'}`}>{option.description}</span>
                        </button>
                    ))}
                </div>

                {dashboardData && activeView === 'library' ? (
                    <DiscoverLibraryView
                        data={dashboardData}
                        recentLimit={recentLimit}
                        onRecentLimitChange={handleRecentLimitChange}
                        isJellyfinPortal={isJellyfinPortal}
                        showQualityBadges={showQualityBadges}
                        useScrollRevealAnimations={publicConfig?.useScrollRevealAnimations}
                    />
                ) : dashboardData ? (
                    <DiscoverCommunityView
                        activeSessions={dashboardData.activeSessions || []}
                        trendingStats={trendingStats}
                        trendingLoading={trendingLoading}
                        recentLimit={recentLimit}
                        isWidePortalLayout={isWidePortalLayout}
                        showQualityBadges={showQualityBadges}
                        useScrollRevealAnimations={publicConfig?.useScrollRevealAnimations}
                        serverName={publicConfig?.serverIdentifier}
                        isJellyfinPortal={isJellyfinPortal}
                        onSelectSession={setSelectedSession}
                    />
                ) : null}
            </main>

            {selectedSession && <StreamDetailsModal session={selectedSession} onClose={() => setSelectedSession(null)} isAdmin={isAdmin} onKilled={fetchDashboardOnly} providerLabel={isJellyfinPortal ? 'Jellyfin' : 'Plex'} />}
        </div>
    );
};
