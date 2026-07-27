import React from 'react';
import { AlertTriangle, Bell, BellOff, CheckCircle2, Clock3, ExternalLink, Film, Loader2, Tv } from 'lucide-react';
import type { RequestMediaItem } from './types';

const statusText = (item: RequestMediaItem) => {
    if (item.available) return 'Available';
    if (item.processing) return 'Processing';
    if (item.notifying) return 'Notifying';
    if (item.canNotify) return 'Notify';
    if (item.requested || item.pending || item.approved) return 'Requested';
    return item.mediaType === 'tv' ? 'Request Show' : 'Request Movie';
};

const StatusIcon = ({ item, busy }: { item: RequestMediaItem; busy?: boolean }) => {
    if (busy) return <Loader2 className="w-4 h-4 animate-spin" />;
    if (item.available || item.approved) return <CheckCircle2 className="w-4 h-4" />;
    if (item.notifying) return <BellOff className="w-4 h-4" />;
    if (item.canNotify) return <Bell className="w-4 h-4" />;
    if (item.requested || item.pending || item.processing || item.approved) return <Clock3 className="w-4 h-4" />;
    return item.mediaType === 'tv' ? <Tv className="w-4 h-4" /> : <Film className="w-4 h-4" />;
};

export const RequestMediaCard = React.memo<{
    item: RequestMediaItem;
    busy?: boolean;
    priority?: boolean;
    onOpen: (item: RequestMediaItem) => void;
    onRequest: (item: RequestMediaItem) => void;
    onNotify?: (item: RequestMediaItem) => void;
    onReportIssue: (item: RequestMediaItem) => void;
}>(({ item, busy = false, priority = false, onOpen, onRequest, onNotify, onReportIssue }) => {
    const notifyMode = !item.available && (item.canNotify || item.notifying);
    const disabled = busy
        || (notifyMode ? false : item.canRequest === false);
    const badgeClass = item.available
        ? 'bg-green-500/20 text-green-200 border-green-500/30'
        : notifyMode
            ? 'bg-sky-500/20 text-sky-100 border-sky-500/30'
            : item.requested || item.pending || item.processing || item.approved
                ? 'bg-amber-500/20 text-amber-100 border-amber-500/30'
                : 'bg-plex/15 text-plex border-plex/30';

    return (
        <article className="group relative overflow-hidden rounded-xl border border-white/10 bg-card shadow-lg min-h-full flex flex-col">
            <button
                type="button"
                onClick={() => onOpen(item)}
                className="relative block w-full aspect-[2/3] bg-background overflow-hidden text-left focus:outline-none focus:ring-2 focus:ring-plex/70"
            >
                {item.posterUrl ? (
                    <img src={item.posterUrl} alt={item.title} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" loading={priority ? 'eager' : 'lazy'} fetchPriority={priority ? 'high' : 'auto'} decoding="async" />
                ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted bg-background/70">
                        {item.mediaType === 'tv' ? <Tv className="w-10 h-10" /> : <Film className="w-10 h-10" />}
                    </div>
                )}
                <div className="absolute top-2 left-2 flex gap-1.5">
                    <span className="px-2 py-1 rounded-md bg-black/70 text-[10px] font-bold uppercase tracking-wider text-white border border-white/10">
                        {item.mediaType === 'tv' ? 'TV' : 'Movie'}
                    </span>
                    {item.year && (
                        <span className="px-2 py-1 rounded-md bg-black/60 text-[10px] font-bold text-white/80 border border-white/10">
                            {item.year}
                        </span>
                    )}
                </div>
                {item.rating ? (
                    <span className="absolute top-2 right-2 px-2 py-1 rounded-md bg-black/70 text-[10px] font-bold text-white border border-white/10">
                        {item.rating.toFixed(1)}
                    </span>
                ) : null}
            </button>

            <div className="p-3 flex flex-col gap-3 flex-1">
                <button type="button" onClick={() => onOpen(item)} className="w-full min-h-[3rem] text-left focus:outline-none focus:ring-2 focus:ring-plex/70 rounded-md">
                    <h3 className="font-bold text-sm text-text line-clamp-2 leading-snug group-hover:text-plex transition-colors">
                        {item.title}
                    </h3>
                    {item.overview ? (
                        <p className="text-xs text-muted line-clamp-2 mt-1 leading-relaxed">{item.overview}</p>
                    ) : null}
                    {item.genres?.length ? (
                        <div className="flex flex-wrap gap-1 mt-2">
                            {item.genres.slice(0, 2).map((genre) => (
                                <span key={`${genre.id || genre.name}`} className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-white/5 text-muted border border-white/10">
                                    {genre.name}
                                </span>
                            ))}
                        </div>
                    ) : null}
                </button>
                <div className="mt-auto flex flex-col gap-2">
                    {item.available && (item.mediaId || item.ratingKey) ? (
                        <button type="button" onClick={() => onReportIssue(item)} className="inline-flex items-center justify-center gap-2 rounded-lg border border-amber-500/30 px-3 py-2 text-xs font-bold text-amber-100 transition-colors hover:bg-amber-500/10">
                            <AlertTriangle className="h-4 w-4" /> Report Issue
                        </button>
                    ) : null}
                    {item.available && item.plexUrl ? (
                        <a href={item.plexUrl} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 rounded-lg border border-green-500/30 bg-green-500/20 px-3 py-2 text-xs font-bold text-green-100 transition-colors hover:bg-green-500/30">
                            <ExternalLink className="h-4 w-4" /> Open in Plex
                        </a>
                    ) : (
                        <button
                            type="button"
                            disabled={disabled}
                            title={
                                notifyMode
                                    ? (item.notifying
                                        ? 'Stop availability notifications'
                                        : 'Get notified when this becomes available')
                                    : (item.mediaType === 'tv' ? 'Request all available seasons' : `Request ${item.title}`)
                            }
                            onClick={() => {
                                if (notifyMode && onNotify) onNotify(item);
                                else onRequest(item);
                            }}
                            className={`inline-flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-80 ${badgeClass} ${disabled ? '' : 'hover:bg-plex hover:text-background hover:border-plex'}`}
                        >
                            <StatusIcon item={item} busy={busy} />
                            {statusText(item)}
                        </button>
                    )}
                </div>
            </div>
        </article>
    );
});
