import React from 'react';

import { portalUrl, resolvePortalAssetUrl } from '../../shared/basePath';
import { formatTime } from '../../shared/format';

type ActiveStreamCardProps = {
    session: any;
    columns: number;
    onSelect: (session: any) => void;
};

const getArtwork = (session: any) => ({
    posterSrc: session.thumbUrl
        ? resolvePortalAssetUrl(session.thumbUrl)
        : portalUrl(`/api/plex/image?path=${encodeURIComponent(session.thumb)}&width=300&height=500`),
    userThumbSrc: session.userThumb
        ? resolvePortalAssetUrl(session.userThumb)
        : 'https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y',
});

const getProgress = (session: any) => {
    const progress = Math.max(0, Math.min(100, Number(session.progress) || 0));
    const state = String(session.state || 'unknown');
    const text = `${Math.round(progress)}%${session.timeRemaining > 0 && state === 'playing' ? ` | ETA ${formatTime(new Date(Date.now() + session.timeRemaining))}` : ''}`;
    return { progress, state, text };
};

const interactiveProps = (session: any, onSelect: (session: any) => void) => ({
    role: 'button' as const,
    tabIndex: 0,
    onClick: () => onSelect(session),
    onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onSelect(session);
        }
    },
});

export const ActiveStreamCard: React.FC<ActiveStreamCardProps> = ({ session, columns, onSelect }) => {
    const { posterSrc, userThumbSrc } = getArtwork(session);
    const { progress, state, text: progressText } = getProgress(session);

    return (
        <article {...interactiveProps(session, onSelect)} className="flex h-full min-h-[11.5rem] select-none flex-col overflow-hidden rounded-xl border border-border bg-card text-left shadow-lg transition-all hover:border-plex/50 hover:shadow-plex/20 focus:outline-none focus:ring-2 focus:ring-plex md:min-h-[14.5rem]">
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

export const CompactActiveStreamCard: React.FC<Omit<ActiveStreamCardProps, 'columns'>> = ({ session, onSelect }) => {
    const { posterSrc, userThumbSrc } = getArtwork(session);
    const { progress, state } = getProgress(session);
    const title = session.grandparentTitle || session.title;
    const subtitle = session.type === 'episode' && session.season !== undefined && session.episode !== undefined
        ? `${session.title} | S${String(session.season).padStart(2, '0')}E${String(session.episode).padStart(2, '0')}`
        : session.grandparentTitle ? session.title : session.playerTitle;

    return (
        <article {...interactiveProps(session, onSelect)} className="relative flex min-h-28 select-none overflow-hidden rounded-lg border border-border bg-card text-left shadow-md transition-colors hover:border-plex/50 focus:outline-none focus:ring-2 focus:ring-plex">
            <div className="relative w-[4.75rem] flex-none overflow-hidden bg-background sm:w-20">
                <img src={posterSrc} alt={session.title} loading="eager" decoding="async" className="absolute inset-0 h-full w-full object-cover object-top" />
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-1.5 p-3 pb-4">
                <div className="flex min-w-0 items-start justify-between gap-3">
                    <div className="min-w-0">
                        <div className="truncate text-sm font-bold text-text">{title}</div>
                        {subtitle && <div className="truncate text-xs text-muted">{subtitle}</div>}
                    </div>
                    {session.user && (
                        <div className="flex max-w-32 flex-none items-center gap-1.5 text-xs text-muted">
                            <img src={userThumbSrc} alt="" className="h-5 w-5 rounded-full object-cover" />
                            <span className="truncate">{session.user}</span>
                        </div>
                    )}
                </div>
                <div className="mt-auto flex flex-wrap items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide">
                    {session.resolution && <span className="rounded border border-white/10 bg-white/10 px-1.5 py-0.5 text-white/90">{session.resolution}</span>}
                    <span className={session.isTranscoding ? 'text-status-expiring' : 'text-status-active'}>{session.isTranscoding ? 'Transcode' : 'Direct Play'}</span>
                    <span className="text-muted">{state}</span>
                    <span className="text-muted">{((Number(session.bandwidth) || 0) / 1000).toFixed(1)} Mbps</span>
                </div>
            </div>
            <div className="absolute inset-x-0 bottom-0 h-1.5 bg-background/80">
                <div className="h-full bg-plex transition-all duration-1000" style={{ width: `${progress}%` }} />
            </div>
        </article>
    );
};
