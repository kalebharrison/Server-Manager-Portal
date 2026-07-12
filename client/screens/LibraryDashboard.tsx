import React, { useCallback, useEffect, useState } from 'react';

import { apiFetch } from '../shared/api';
import { usePortalWideContentLayout } from '../shared/portalLayout';
import { useVisibleInterval } from '../shared/useVisibleInterval';
import { DiscoverCommunityView } from './discover/DiscoverCommunityView';
import { DiscoverLibraryView } from './discover/DiscoverLibraryView';
import { StreamDetailsModal } from './StreamDetailsModal';
import { DISCOVER_DESKTOP_ITEM_LIMIT, DISCOVER_MOBILE_ITEM_LIMIT } from './DiscoverContent';

type DiscoverView = 'library' | 'community';
type LibraryData = { recentMovies: any[]; recentShows: any[]; recentMusic: any[] };
type TrendingStats = { trending7Days: any[]; movies30Days: any[]; shows30Days: any[] };

const EMPTY_LIBRARY: LibraryData = { recentMovies: [], recentShows: [], recentMusic: [] };
const LIBRARY_STORAGE_KEY = 'discoverLibrarySnapshot';
const readCachedLibrary = (): LibraryData | null => {
    try {
        const value = JSON.parse(sessionStorage.getItem(LIBRARY_STORAGE_KEY) || 'null');
        return value?.recentMovies && value?.recentShows && value?.recentMusic ? value : null;
    } catch {
        return null;
    }
};

export const LibraryDashboard: React.FC<{ onBack: () => void; isAdmin?: boolean; publicConfig?: any; mediaServerType?: string }> = ({ isAdmin, publicConfig, mediaServerType }) => {
    const [activeView, setActiveView] = useState<DiscoverView>('library');
    const [libraryData, setLibraryData] = useState<LibraryData | null>(readCachedLibrary);
    const [activeSessions, setActiveSessions] = useState<any[]>([]);
    const [trendingStats, setTrendingStats] = useState<TrendingStats | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [selectedSession, setSelectedSession] = useState<any | null>(null);
    const isWidePortalLayout = usePortalWideContentLayout();
    const [isDiscoverDesktop, setIsDiscoverDesktop] = useState(() => window.matchMedia('(min-width: 1024px)').matches);
    const [recentLimitOverride, setRecentLimitOverride] = useState<number | null>(() => {
        const saved = localStorage.getItem('discoverRecentLimitOverride');
        return saved ? Math.min(50, Math.max(12, Number(saved) || 20)) : null;
    });
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
    }, []);

    const updateLibrary = useCallback((result: any) => {
        const next = {
            recentMovies: result?.recentMovies || [],
            recentShows: result?.recentShows || [],
            recentMusic: result?.recentMusic || [],
        };
        setLibraryData(next);
        sessionStorage.setItem(LIBRARY_STORAGE_KEY, JSON.stringify(next));
    }, []);

    const fetchLibrary = useCallback(async () => {
        try {
            const endpoint = isJellyfinPortal ? '/api/jellyfin/dashboard' : '/api/plex/library';
            const result = await apiFetch(`${endpoint}?limit=${recentLimit}`, { cacheTtlMs: 5 * 60_000, staleIfErrorMs: 60 * 60_000 });
            updateLibrary(result);
            if (isJellyfinPortal) setActiveSessions(result?.activeSessions || []);
            setError(null);
        } catch (fetchError: any) {
            if (!readCachedLibrary()) setError(fetchError?.message || 'Discover is temporarily unavailable');
        }
    }, [isJellyfinPortal, recentLimit, updateLibrary]);

    const fetchSessions = useCallback(async () => {
        try {
            const endpoint = isJellyfinPortal ? '/api/jellyfin/dashboard?limit=1' : '/api/plex/sessions';
            const result = await apiFetch(endpoint, { cacheTtlMs: 8_000, staleIfErrorMs: 60_000, forceRefresh: true });
            setActiveSessions(result?.activeSessions || []);
        } catch {
            // Preserve the last live-session snapshot during a short backend interruption.
        }
    }, [isJellyfinPortal]);

    const fetchTrending = useCallback(async () => {
        if (isJellyfinPortal) return;
        try {
            const result = await apiFetch('/api/plex/stats/trending', { cacheTtlMs: 5 * 60_000, staleIfErrorMs: 60 * 60_000 });
            setTrendingStats(result);
        } catch {
            // Keep the last community snapshot visible during a short analytics interruption.
        }
    }, [isJellyfinPortal]);

    useEffect(() => { void fetchLibrary(); }, [fetchLibrary]);
    useEffect(() => {
        if (activeView !== 'community') return;
        void fetchSessions();
        void fetchTrending();
    }, [activeView, fetchSessions, fetchTrending]);
    useVisibleInterval(fetchLibrary, 5 * 60_000);
    useVisibleInterval(activeView === 'community' ? fetchSessions : () => {}, activeView === 'community' ? 10_000 : null);
    useVisibleInterval(activeView === 'community' ? fetchTrending : () => {}, activeView === 'community' ? 5 * 60_000 : null);

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

                {activeView === 'library' ? (
                    <DiscoverLibraryView data={libraryData || EMPTY_LIBRARY} recentLimit={recentLimit} onRecentLimitChange={handleRecentLimitChange} isJellyfinPortal={isJellyfinPortal} showQualityBadges={showQualityBadges} useScrollRevealAnimations={publicConfig?.useScrollRevealAnimations} />
                ) : (
                    <DiscoverCommunityView activeSessions={activeSessions} trendingStats={trendingStats} recentLimit={recentLimit} isWidePortalLayout={isWidePortalLayout} showQualityBadges={showQualityBadges} useScrollRevealAnimations={publicConfig?.useScrollRevealAnimations} serverName={publicConfig?.serverIdentifier} isJellyfinPortal={isJellyfinPortal} onSelectSession={setSelectedSession} />
                )}
            </main>
            {selectedSession && <StreamDetailsModal session={selectedSession} onClose={() => setSelectedSession(null)} isAdmin={isAdmin} onKilled={fetchSessions} providerLabel={isJellyfinPortal ? 'Jellyfin' : 'Plex'} />}
        </div>
    );
};
