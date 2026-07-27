import React from 'react';
import {
    Bell,
    BellOff,
    CheckCircle2,
    Clock3,
    Film,
    Loader2,
    Tv,
} from 'lucide-react';
import { DiscoverPosterCard } from '../screens';
import type { DiscoverQuickRequestApi } from './DiscoverQuickRequestButton';
import type { DiscoverNotifyApi } from './useDiscoverNotify';
import { genreLabelsFromItem } from './discoverGenreLabels';
import { useDiscoverI18n } from './i18n';

type Props = {
    item: any;
    formatted: any;
    onSelect: (item: any) => void;
    quickRequest?: DiscoverQuickRequestApi;
    notify?: DiscoverNotifyApi;
    priority?: boolean;
};

export const DiscoverBrowseCard: React.FC<Props> = ({
    item,
    formatted,
    onSelect,
    quickRequest,
    notify,
    priority = false,
}) => {
    const { t } = useDiscoverI18n();
    const mediaType = String(formatted?.mediaType || formatted?.type || 'movie').toLowerCase();
    const isTv = mediaType === 'tv';
    const availability = formatted?.availability;
    const kind = availability?.kind || 'none';

    const requesting = !!quickRequest?.isRequesting(formatted);
    const requestedLocal = !!quickRequest?.isRequested(formatted);
    const notifying = !!notify?.isNotifying(item) || !!notify?.isNotifying(formatted);
    const notifyBusy = !!notify?.isBusy(item) || !!notify?.isBusy(formatted);
    const canNotify = !!notify?.canNotify(item) || !!notify?.canNotify(formatted) || (!!item?.canNotify && !notifying);
    const canRequest = !!quickRequest?.canQuickRequest(formatted);

    const available = kind === 'available' || kind === 'partial';
    const processing = kind === 'processing';
    const pending = kind === 'pending' || kind === 'requested' || requestedLocal;

    const genres = genreLabelsFromItem(item, 2);
    const rating = Number(formatted?.voteAverage ?? item?.voteAverage);
    const overview = String(formatted?.overview || item?.overview || '').trim();
    const year = formatted?.year || '';
    const qualityTags = Array.isArray(formatted?.qualityTags) && formatted.qualityTags.length
        ? formatted.qualityTags
        : (Array.isArray(item?.displayTags) && item.displayTags.length
            ? item.displayTags
            : (Array.isArray(item?.mediaInfo?.displayTags) ? item.mediaInfo.displayTags : []));
    const showQuality = available && qualityTags.length > 0;

    let statusLabel = isTv ? t('browse.requestShow') : t('browse.requestMovie');
    let badgeClass = 'bg-plex/15 text-plex border-plex/30';
    let StatusIcon: React.FC<{ className?: string }> = isTv ? Tv : Film;
    let disabled = false;
    let onClick: (() => void) | null = () => { void quickRequest?.quickRequest(formatted); };

    if (available) {
        statusLabel = kind === 'partial' ? t('status.partial') : t('status.available');
        badgeClass = 'bg-green-500/20 text-green-200 border-green-500/30';
        StatusIcon = CheckCircle2;
        disabled = true;
        onClick = null;
    } else if (processing) {
        statusLabel = t('status.processing');
        badgeClass = 'bg-blue-500/20 text-blue-100 border-blue-500/30';
        StatusIcon = Loader2;
        disabled = true;
        onClick = null;
    } else if (pending && !canNotify && !notifying) {
        statusLabel = kind === 'pending' ? t('status.pending') : t('status.requested');
        badgeClass = 'bg-amber-500/20 text-amber-100 border-amber-500/30';
        StatusIcon = Clock3;
        disabled = true;
        onClick = null;
    } else if (notifying || canNotify) {
        statusLabel = notifying ? t('browse.notifying') : t('browse.notify');
        badgeClass = notifying
            ? 'bg-sky-500/20 text-sky-100 border-sky-500/30'
            : 'bg-sky-500/15 text-sky-100 border-sky-500/30';
        StatusIcon = notifying ? BellOff : Bell;
        disabled = notifyBusy;
        onClick = () => { void notify?.toggleNotify(item); };
    } else if (requesting) {
        statusLabel = t('browse.requesting');
        badgeClass = 'bg-plex/15 text-plex border-plex/30';
        StatusIcon = Loader2;
        disabled = true;
        onClick = null;
    } else if (!canRequest) {
        statusLabel = t('status.requested');
        badgeClass = 'bg-amber-500/20 text-amber-100 border-amber-500/30';
        StatusIcon = Clock3;
        disabled = true;
        onClick = null;
    }

    return (
        <article className="group relative overflow-hidden rounded-xl border border-white/10 bg-card shadow-lg min-h-full flex flex-col">
            <button
                type="button"
                onClick={() => onSelect(formatted)}
                className="relative block w-full aspect-[2/3] bg-background overflow-hidden text-left focus:outline-none focus:ring-2 focus:ring-plex/70"
            >
                {formatted.thumbUrl ? (
                    <img
                        src={formatted.thumbUrl}
                        alt={formatted.title}
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                        loading={priority ? 'eager' : 'lazy'}
                        decoding="async"
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted bg-background/70">
                        {isTv ? <Tv className="w-10 h-10" /> : <Film className="w-10 h-10" />}
                    </div>
                )}
                <div className="absolute top-2 left-2 flex gap-1.5">
                    <span className="px-2 py-1 rounded-md bg-black/70 text-[10px] font-bold uppercase tracking-wider text-white border border-white/10">
                        {isTv ? 'TV' : 'Movie'}
                    </span>
                    {year ? (
                        <span className="px-2 py-1 rounded-md bg-black/60 text-[10px] font-bold text-white/80 border border-white/10">
                            {year}
                        </span>
                    ) : null}
                </div>
                {Number.isFinite(rating) && rating > 0 ? (
                    <span className="absolute top-2 right-2 px-2 py-1 rounded-md bg-black/70 text-[10px] font-bold text-white border border-white/10">
                        {rating.toFixed(1)}
                    </span>
                ) : null}
                {showQuality ? (
                    <div className="absolute bottom-2 left-2 right-2 flex flex-wrap gap-1 pointer-events-none z-10">
                        {qualityTags.slice(0, 4).map((tag: string) => (
                            <span
                                key={tag}
                                className="text-[9px] font-black px-1.5 py-0.5 rounded bg-black/85 text-white border border-white/20 uppercase tracking-wide"
                            >
                                {tag}
                            </span>
                        ))}
                    </div>
                ) : null}
            </button>

            <div className="p-3 flex flex-col gap-3 flex-1">
                <button
                    type="button"
                    onClick={() => onSelect(formatted)}
                    className="w-full min-h-[3rem] text-left focus:outline-none focus:ring-2 focus:ring-plex/70 rounded-md"
                >
                    <h3 className="font-bold text-sm text-text line-clamp-2 leading-snug group-hover:text-plex transition-colors">
                        {formatted.title}
                    </h3>
                    {overview ? (
                        <p className="text-xs text-muted line-clamp-2 mt-1 leading-relaxed">{overview}</p>
                    ) : null}
                    {genres.length ? (
                        <div className="flex flex-wrap gap-1 mt-2">
                            {genres.map((genre) => (
                                <span
                                    key={genre}
                                    className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-white/5 text-muted border border-white/10"
                                >
                                    {genre}
                                </span>
                            ))}
                        </div>
                    ) : null}
                </button>

                <div className="mt-auto">
                    <button
                        type="button"
                        disabled={disabled || !onClick}
                        title={
                            canNotify || notifying
                                ? (notifying ? t('browse.notifyingHint') : t('browse.notifyHint'))
                                : (isTv ? t('browse.requestAllSeasons') : statusLabel)
                        }
                        onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            onClick?.();
                        }}
                        className={`w-full inline-flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-80 ${badgeClass} ${
                            disabled || !onClick ? '' : 'hover:bg-plex hover:text-background hover:border-plex'
                        }`}
                    >
                        <StatusIcon className={`w-4 h-4${(requesting || notifyBusy || (processing && StatusIcon === Loader2)) ? ' animate-spin' : ''}`} />
                        {statusLabel}
                    </button>
                </div>
            </div>
        </article>
    );
};

/** Keep compact poster path available for Home rails. */
export const DiscoverCompactPosterSlot: React.FC<{
    formatted: any;
    overlay: React.ReactNode;
    onSelect: (item: any) => void;
}> = ({ formatted, overlay, onSelect }) => (
    <DiscoverPosterCard
        item={formatted}
        overlay={overlay}
        showQualityBadges={false}
        onPosterClick={() => onSelect(formatted)}
    />
);
