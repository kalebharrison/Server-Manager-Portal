import React, { useCallback, useEffect, useState } from 'react';

import { apiFetch } from '../../shared/api';
import { portalUrl, resolvePortalAssetUrl } from '../../shared/basePath';
import { formatTime } from '../../shared/format';
import { activityStreamColumnCount, activityStreamGridClass, usePortalWideContentLayout } from '../../shared/portalLayout';
import { useVisibleInterval } from '../../shared/useVisibleInterval';
import { StreamDetailsModal } from '../StreamDetailsModal';

const StreamCard: React.FC<{ session: any; columns: number; onSelect: (session: any) => void }> = ({ session, columns, onSelect }) => {
    const posterSrc = session.thumbUrl
        ? resolvePortalAssetUrl(session.thumbUrl)
        : portalUrl(`/api/plex/image?path=${encodeURIComponent(session.thumb)}&width=300&height=500`);
    const userThumbSrc = session.userThumb
        ? resolvePortalAssetUrl(session.userThumb)
        : 'https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y';
    const progress = Math.max(0, Math.min(100, Number(session.progress) || 0));
    const state = String(session.state || 'unknown');
    const progressText = `${Math.round(progress)}%${session.timeRemaining > 0 && state === 'playing' ? ` | ETA ${formatTime(new Date(Date.now() + session.timeRemaining))}` : ''}`;

    return (
        <article role="button" tabIndex={0} onClick={() => onSelect(session)} onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onSelect(session);
            }
        }} className="flex h-full min-h-[11.5rem] select-none flex-col overflow-hidden rounded-xl border border-border bg-card text-left shadow-lg transition-all hover:border-plex/50 hover:shadow-plex/20 focus:outline-none focus:ring-2 focus:ring-plex md:min-h-[14.5rem]">
            <div className="flex min-h-0 flex-1 flex-row items-stretch">
                <div className={`${columns === 4 ? 'w-28 md:w-32' : 'w-32 md:w-40'} relative flex-shrink-0 self-stretch overflow-hidden bg-card`}>
                    <img src={posterSrc} alt={session.title} loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover object-top" />
                </div>
                <div className="relative flex min-w-0 flex-1 flex-col p-2 md:p-3">
                    {session.user && (
                        <div className="absolute right-2 top-2 flex items-center gap-1.5 rounded-full border border-white/5 bg-black/50 p-0.5 pr-2.5 shadow-md backdrop-blur-md">
                            <img src={userThumbSrc} alt="" className="h-5 w-5 rounded-full object-cover" />
                            <span className="max-w-[100px] truncate text-[10px] font-bold text-white/90">{session.user}</span>
                        </div>
                    )}
                    <div className="mb-0.5 pr-20 md:pr-28">
                        <div className="line-clamp-2 text-sm font-bold leading-tight text-text md:text-base">{session.grandparentTitle || session.title}</div>
                        {session.type === 'episode' && session.season !== undefined && session.episode !== undefined ? (
                            <div className="mt-0.5 line-clamp-2 text-[10px] leading-snug text-muted md:text-xs">{session.title} | S{String(session.season).padStart(2, '0')}E{String(session.episode).padStart(2, '0')}</div>
                        ) : session.grandparentTitle ? (
                            <div className="mt-0.5 line-clamp-2 text-[10px] leading-snug text-muted md:text-xs">{session.title}</div>
                        ) : null}
                    </div>
                    <div className="mb-2 mt-0.5 flex flex-wrap gap-1">
                        {session.resolution && <span className="rounded border border-white/10 bg-white/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white/90">{session.resolution}</span>}
                        <span className={`rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${session.sessionLocation === 'lan' ? 'border-status-active/30 bg-status-active/20 text-status-active' : 'border-plex/30 bg-plex/20 text-plex'}`}>{session.sessionLocation === 'lan' ? 'Local' : 'Remote'}</span>
                    </div>
                    <dl className="mt-auto flex flex-col text-[10px] md:text-xs">
                        <div className="flex items-start justify-between border-b border-white/5 pb-0.5"><dt className="font-bold uppercase tracking-wider text-muted">Player</dt><dd className="max-w-[180px] break-words text-right">{session.playerTitle}</dd></div>
                        <div className="flex items-center justify-between border-b border-white/5 pb-0.5"><dt className="font-bold uppercase tracking-wider text-muted">Stream</dt><dd className={`font-bold ${session.isTranscoding ? 'text-status-expiring' : 'text-status-active'}`}>{session.isTranscoding ? 'Transcode' : 'Direct Play'}</dd></div>
                        <div className="flex items-center justify-between border-b border-white/5 pb-0.5"><dt className="font-bold uppercase tracking-wider text-muted">State</dt><dd className="font-bold">{state.charAt(0).toUpperCase() + state.slice(1)}</dd></div>
                        <div className="flex items-center justify-between pb-0.5"><dt className="font-bold uppercase tracking-wider text-muted">Bandwidth</dt><dd>{((Number(session.bandwidth) || 0) / 1000).toFixed(1)} Mbps</dd></div>
                    </dl>
                </div>
            </div>
            <div className="relative mt-auto h-4 w-full overflow-hidden rounded-b-lg bg-background/80">
                <div className="absolute inset-y-0 left-0 bg-plex transition-all duration-1000" style={{ width: `${progress}%` }} />
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center whitespace-nowrap text-[10px] font-bold text-white mix-blend-difference">{progressText}</div>
            </div>
        </article>
    );
};

export const ActiveStreamsPanel: React.FC<{ isAdmin?: boolean; isJellyfinPortal: boolean; className?: string }> = ({ isAdmin, isJellyfinPortal, className = '' }) => {
    const [activeSessions, setActiveSessions] = useState<any[]>([]);
    const [selectedSession, setSelectedSession] = useState<any | null>(null);
    const isWidePortalLayout = usePortalWideContentLayout();

    const fetchSessions = useCallback(async () => {
        try {
            const endpoint = isJellyfinPortal ? '/api/jellyfin/sessions' : '/api/plex/sessions';
            const result = await apiFetch(endpoint, { cacheTtlMs: 8_000, staleIfErrorMs: 60_000, forceRefresh: true });
            setActiveSessions(result?.activeSessions || []);
        } catch {
            // Preserve the last live snapshot during short backend interruptions.
        }
    }, [isJellyfinPortal]);

    useEffect(() => { void fetchSessions(); }, [fetchSessions]);
    useVisibleInterval(fetchSessions, 10_000);

    const totalStreams = activeSessions.length;
    const transcodingStreams = activeSessions.filter((session) => session.isTranscoding).length;
    const totalBandwidthMbps = (activeSessions.reduce((total, session) => total + (Number(session.bandwidth) || 0), 0) / 1000).toFixed(2);
    const columns = activityStreamColumnCount(isWidePortalLayout, totalStreams);

    return (
        <section className={`w-full ${className}`}>
            <div className="mb-5 flex items-end justify-between border-b border-white/10 pb-2">
                <h2 className="text-sm font-bold uppercase tracking-[2px] text-plex">Now Streaming</h2>
                {totalStreams > 0 && <span className="text-xs text-muted">{totalStreams} active | {transcodingStreams} transcoding | {totalBandwidthMbps} Mbps</span>}
            </div>
            {activeSessions.length ? (
                <div className={activityStreamGridClass(isWidePortalLayout, activeSessions.length)}>
                    {activeSessions.map((session, index) => <StreamCard key={session.sessionId ?? index} session={session} columns={columns} onSelect={setSelectedSession} />)}
                </div>
            ) : (
                <div className="w-full rounded-lg border border-dashed border-border px-4 py-5 text-center text-sm text-muted">No active streams</div>
            )}
            {selectedSession && <StreamDetailsModal session={selectedSession} onClose={() => setSelectedSession(null)} isAdmin={isAdmin} onKilled={fetchSessions} providerLabel={isJellyfinPortal ? 'Jellyfin' : 'Plex'} />}
        </section>
    );
};
