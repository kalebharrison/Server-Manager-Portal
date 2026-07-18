import React, { lazy, Suspense, useCallback, useEffect, useState } from 'react';

import { apiFetch } from '../../shared/api';
import { activityStreamColumnCount, activityStreamGridClass, usePortalWideContentLayout } from '../../shared/portalLayout';
import { useVisibleInterval } from '../../shared/useVisibleInterval';
import { ActiveStreamCard, CompactActiveStreamCard } from './ActiveStreamCard';

const StreamDetailsModal = lazy(() => import('../StreamDetailsModal').then((module) => ({ default: module.StreamDetailsModal })));

type ActiveStreamsPanelProps = {
    isAdmin?: boolean;
    isJellyfinPortal: boolean;
    className?: string;
    variant?: 'detailed' | 'compact';
};

const sessionFingerprint = (sessions: any[]) => sessions.map((session) => [
    session.sessionId || '',
    session.ratingKey || '',
    session.progress || '',
    session.bandwidth || '',
    session.isTranscoding ? '1' : '0',
    session.user || '',
].join(':')).join('|');

const sessionKey = (session: any, index: number) => (
    session.sessionId
    || [session.ratingKey, session.user, session.player, index].filter(Boolean).join(':')
);

export const ActiveStreamsPanel: React.FC<ActiveStreamsPanelProps> = ({ isAdmin, isJellyfinPortal, className = '', variant = 'detailed' }) => {
    const [activeSessions, setActiveSessions] = useState<any[]>([]);
    const [selectedSession, setSelectedSession] = useState<any | null>(null);
    const [hasLoaded, setHasLoaded] = useState(false);
    const isWidePortalLayout = usePortalWideContentLayout();

    const fetchSessions = useCallback(async () => {
        try {
            const endpoint = isJellyfinPortal ? '/api/jellyfin/sessions' : '/api/plex/sessions';
            const result = await apiFetch(endpoint, { cacheTtlMs: 8_000, staleIfErrorMs: 60_000 });
            const next = result?.activeSessions || [];
            setActiveSessions((current) => (
                sessionFingerprint(current) === sessionFingerprint(next) ? current : next
            ));
        } catch {
            // Preserve the last live snapshot during short backend interruptions.
        } finally {
            setHasLoaded(true);
        }
    }, [isJellyfinPortal]);

    useEffect(() => { void fetchSessions(); }, [fetchSessions]);
    useVisibleInterval(fetchSessions, 10_000);

    const totalStreams = activeSessions.length;
    const transcodingStreams = activeSessions.filter((session) => session.isTranscoding).length;
    const totalBandwidthMbps = (activeSessions.reduce((total, session) => total + (Number(session.bandwidth) || 0), 0) / 1000).toFixed(2);
    const columns = activityStreamColumnCount(isWidePortalLayout, totalStreams);
    const isCompact = variant === 'compact';

    return (
        <section className={`w-full ${className}`}>
            <div className={`${isCompact ? 'mb-3' : 'mb-5'} flex items-end justify-between border-b border-white/10 pb-2`}>
                <h2 className="text-sm font-bold uppercase tracking-[2px] text-plex">Now Streaming</h2>
                {totalStreams > 0 && <span className="text-xs text-muted">{totalStreams} active | {transcodingStreams} transcoding | {totalBandwidthMbps} Mbps</span>}
            </div>
            {!hasLoaded ? (
                <div className={`w-full rounded-lg border border-dashed border-border px-4 text-center text-sm text-muted ${isCompact ? 'py-3' : 'py-5'}`}>Checking active streams…</div>
            ) : activeSessions.length ? (
                <div className={isCompact ? 'grid grid-cols-1 gap-3 xl:grid-cols-2' : activityStreamGridClass(isWidePortalLayout, activeSessions.length)}>
                    {activeSessions.map((session, index) => isCompact
                        ? <CompactActiveStreamCard key={sessionKey(session, index)} session={session} onSelect={setSelectedSession} />
                        : <ActiveStreamCard key={sessionKey(session, index)} session={session} columns={columns} onSelect={setSelectedSession} />)}
                </div>
            ) : (
                <div className={`w-full rounded-lg border border-dashed border-border px-4 text-center text-sm text-muted ${isCompact ? 'py-3' : 'py-5'}`}>No active streams</div>
            )}
            {selectedSession && (
                <Suspense fallback={null}>
                    <StreamDetailsModal
                        session={selectedSession}
                        onClose={() => setSelectedSession(null)}
                        isAdmin={isAdmin}
                        onKilled={fetchSessions}
                        providerLabel={isJellyfinPortal ? 'Jellyfin' : 'Plex'}
                    />
                </Suspense>
            )}
        </section>
    );
};
