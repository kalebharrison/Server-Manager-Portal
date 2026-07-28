import React, { useCallback, useEffect, useState } from 'react';

import { apiFetch } from '../shared/api';
import { cacheRefreshMs } from '../shared/cacheRefresh';
import { useVisibleInterval } from '../shared/useVisibleInterval';
import { ActiveStreamsPanel } from './discover/ActiveStreamsPanel';
import { DiscoverCommunityView } from './discover/DiscoverCommunityView';
import { DiscoverLibraryView } from './discover/DiscoverLibraryView';
import { DISCOVER_DESKTOP_ITEM_LIMIT, DISCOVER_MOBILE_ITEM_LIMIT } from './DiscoverContent';

type DiscoverView = 'library' | 'community';
type LibraryData = { recentMovies: any[]; recentShows: any[]; recentMusic: any[] };
type TrendingStats = { trending7Days: any[]; movies30Days: any[]; shows30Days: any[] };

const EMPTY_LIBRARY: LibraryData = { recentMovies: [], recentShows: [], recentMusic: [] };
const libraryStorageKey = (scope?: string, provider?: string) => `discoverLibrary:${scope || 'server'}:${provider || 'plex'}`;
const communityStorageKey = (scope?: string) => `discoverCommunity:${scope || 'server'}`;
const readSessionValue = <T,>(key: string, isValid: (value: any) => boolean): T | null => {
    try {
        const value = JSON.parse(sessionStorage.getItem(key) || 'null');
        return isValid(value) ? value : null;
    } catch {
        return null;
    }
};
const readCachedLibrary = (key: string): LibraryData | null => {
    return readSessionValue<LibraryData>(key, (value) =>
        Array.isArray(value?.recentMovies) && Array.isArray(value?.recentShows) && Array.isArray(value?.recentMusic)
    );
};
const readCachedCommunity = (key: string): TrendingStats | null =>
    readSessionValue<TrendingStats>(key, (value) =>
        Array.isArray(value?.trending7Days) && Array.isArray(value?.movies30Days) && Array.isArray(value?.shows30Days)
    );

export const LibraryDashboard: React.FC<{ isAdmin?: boolean; publicConfig?: any; mediaServerType?: string; cacheScope?: string }> = ({ isAdmin, publicConfig, mediaServerType, cacheScope }) => {
    const storageKey = libraryStorageKey(cacheScope, mediaServerType);
    const trendingStorageKey = communityStorageKey(cacheScope);
    const [activeView, setActiveView] = useState<DiscoverView>('library');
    const [libraryData, setLibraryData] = useState<LibraryData | null>(() => readCachedLibrary(storageKey));
    const [trendingStats, setTrendingStats] = useState<TrendingStats | null>(() => readCachedCommunity(trendingStorageKey));
    const [libraryLoading, setLibraryLoading] = useState(() => !readCachedLibrary(storageKey));
    const [communityLoading, setCommunityLoading] = useState(() => !readCachedCommunity(trendingStorageKey));
    const [error, setError] = useState<string | null>(null);
    const [isDiscoverDesktop, setIsDiscoverDesktop] = useState(() => window.matchMedia('(min-width: 1024px)').matches);
    const [recentLimitOverride, setRecentLimitOverride] = useState<number | null>(() => {
        const saved = localStorage.getItem('discoverRecentLimitOverride');
        return saved ? Math.min(50, Math.max(12, Number(saved) || 20)) : null;
    });
    const recentLimit = recentLimitOverride ?? (isDiscoverDesktop ? DISCOVER_DESKTOP_ITEM_LIMIT : DISCOVER_MOBILE_ITEM_LIMIT);
    const showQualityBadges = publicConfig?.showPosterQualityBadges !== false;
    const isJellyfinPortal = String(publicConfig?.mediaServerType || mediaServerType || 'plex').toLowerCase() === 'jellyfin';
    const refreshMs = cacheRefreshMs(publicConfig);

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
    }, []);

    const updateLibrary = useCallback((result: any) => {
        const next = {
            recentMovies: result?.recentMovies || [],
            recentShows: result?.recentShows || [],
            recentMusic: result?.recentMusic || [],
        };
        setLibraryData(next);
        sessionStorage.setItem(storageKey, JSON.stringify(next));
    }, [storageKey]);

    const fetchLibrary = useCallback(async () => {
        if (!readCachedLibrary(storageKey)) setLibraryLoading(true);
        try {
            const endpoint = isJellyfinPortal ? '/api/jellyfin/dashboard' : '/api/plex/library';
            const result = await apiFetch(`${endpoint}?limit=${recentLimit}`, { cacheTtlMs: refreshMs, staleIfErrorMs: 60 * 60_000 });
            updateLibrary(result);
            setError(null);
        } catch (fetchError: any) {
            if (!readCachedLibrary(storageKey)) setError(fetchError?.message || 'Discover is temporarily unavailable');
        } finally {
            setLibraryLoading(false);
        }
    }, [isJellyfinPortal, recentLimit, refreshMs, storageKey, updateLibrary]);

    const fetchTrending = useCallback(async () => {
        if (isJellyfinPortal) {
            setCommunityLoading(false);
            return;
        }
        if (!readCachedCommunity(trendingStorageKey)) setCommunityLoading(true);
        try {
            const result = await apiFetch('/api/plex/stats/trending', { cacheTtlMs: refreshMs, staleIfErrorMs: 60 * 60_000 });
            setTrendingStats(result);
            sessionStorage.setItem(trendingStorageKey, JSON.stringify(result));
        } catch {
            // Keep the last community snapshot visible during a short analytics interruption.
        } finally {
            setCommunityLoading(false);
        }
    }, [isJellyfinPortal, refreshMs, trendingStorageKey]);

    useEffect(() => { void fetchLibrary(); }, [fetchLibrary]);
    useEffect(() => {
        if (activeView !== 'community') return;
        void fetchTrending();
    }, [activeView, fetchTrending]);
    useVisibleInterval(fetchLibrary, refreshMs);
    useVisibleInterval(activeView === 'community' ? fetchTrending : () => {}, activeView === 'community' ? refreshMs : null);

    return (
        <div className="flex min-h-screen w-full flex-col">
            <main className="discover-layout-container mt-4 w-full pb-8 md:mt-0">
                {error && <div className="toast error show">{error}</div>}
                <header className="mb-7 flex flex-col gap-3 border-b border-white/10 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                        <h1 className="text-2xl font-bold text-text">Discover</h1>
                        <p className="mt-1 text-sm text-muted">Your library and what the community is watching.</p>
                    </div>
                    <nav className="flex gap-6" role="tablist" aria-label="Discover sections">
                        {(['library', 'community'] as DiscoverView[]).map((view) => (
                            <button key={view} type="button" role="tab" aria-selected={activeView === view} onClick={() => setActiveView(view)} className={`border-b-2 px-1 pb-3 text-sm font-bold capitalize transition-colors ${activeView === view ? 'border-plex text-plex' : 'border-transparent text-muted hover:text-text'}`}>{view}</button>
                        ))}
                    </nav>
                </header>

                <ActiveStreamsPanel isAdmin={isAdmin} isJellyfinPortal={isJellyfinPortal} className="mb-10" />

                {activeView === 'library' ? (
                    libraryLoading && !libraryData ? (
                        <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted">Loading your library…</div>
                    ) : (
                        <DiscoverLibraryView data={libraryData || EMPTY_LIBRARY} recentLimit={recentLimit} onRecentLimitChange={handleRecentLimitChange} isJellyfinPortal={isJellyfinPortal} showQualityBadges={showQualityBadges} useScrollRevealAnimations={publicConfig?.useScrollRevealAnimations} />
                    )
                ) : (
                    communityLoading && !trendingStats && !isJellyfinPortal ? (
                        <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted">Loading community activity…</div>
                    ) : (
                        <DiscoverCommunityView trendingStats={trendingStats} recentLimit={recentLimit} showQualityBadges={showQualityBadges} serverName={cacheScope} isJellyfinPortal={isJellyfinPortal} />
                    )
                )}
            </main>
        </div>
    );
};
