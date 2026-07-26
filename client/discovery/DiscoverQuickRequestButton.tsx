import React from 'react';
import { Film, Loader2, Tv } from 'lucide-react';
import { useDiscoverI18n } from './i18n';

export type DiscoverQuickRequestApi = {
    quickRequest: (item: any) => void | Promise<void>;
    canQuickRequest: (item: any) => boolean;
    isRequesting: (item: any) => boolean;
    isRequested: (item: any) => boolean;
};

export const DiscoverQuickRequestButton: React.FC<{
    item: any;
    api: DiscoverQuickRequestApi;
    className?: string;
}> = ({ item, api, className = 'absolute bottom-2 left-2 right-2 z-20' }) => {
    const { t } = useDiscoverI18n();
    const busy = api.isRequesting(item);
    const done = api.isRequested(item);
    const allowed = api.canQuickRequest(item) || done || busy;
    if (!allowed && !done) return null;

    const mediaType = String(item?.mediaType || item?.type || '').toLowerCase();
    const isTv = mediaType === 'tv' || mediaType === 'show' || mediaType === 'series';
    const label = done
        ? t('browse.requested')
        : busy
            ? t('browse.requesting')
            : (isTv ? t('browse.requestShow') : t('browse.requestMovie'));

    return (
        <button
            type="button"
            disabled={busy || done || !api.canQuickRequest(item)}
            title={isTv ? t('browse.requestAllSeasons') : label}
            onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                void api.quickRequest(item);
            }}
            onKeyDown={(event) => event.stopPropagation()}
            className={`${className} inline-flex items-center justify-center gap-1.5 rounded-md border px-2 py-1.5 text-[11px] font-black uppercase tracking-wide transition-colors pointer-events-auto ${
                done
                    ? 'bg-amber-500/25 text-amber-100 border-amber-500/40 cursor-default'
                    : 'bg-black/80 text-plex border-plex/40 hover:bg-plex hover:text-background hover:border-plex disabled:opacity-70'
            }`}
        >
            {busy ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : isTv ? (
                <Tv className="w-3.5 h-3.5" />
            ) : (
                <Film className="w-3.5 h-3.5" />
            )}
            {label}
        </button>
    );
};
