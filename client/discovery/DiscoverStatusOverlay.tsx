import React from 'react';
import {
    AlertCircle,
    Ban,
    CheckCircle,
    Clock,
    Download,
    Layers,
    Radio,
    XCircle,
} from 'lucide-react';
import type { MediaAvailabilityState } from './discoverAvailability';
import { useDiscoverI18n, translateDiscoverStatus } from './i18n';

const pillClass = 'absolute top-2 right-2 z-10 flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-black uppercase tracking-wide shadow-md border';

export const DiscoverStatusOverlay: React.FC<{ state: MediaAvailabilityState }> = ({ state }) => {
    const { t } = useDiscoverI18n();
    if (state.kind === 'none') return null;

    const title = translateDiscoverStatus(t, state.detail || state.label) || state.label;

    if (state.kind === 'upToDate') {
        return (
            <div className={`${pillClass} bg-sky-500/95 text-white border-sky-300/40`} title={title}>
                <Radio className="w-3 h-3" />
                {t('status.upToDate')}
            </div>
        );
    }

    if (state.kind === 'available') {
        return (
            <div className={`${pillClass} bg-green-500/95 text-white border-green-400/30`} title={title}>
                <CheckCircle className="w-3 h-3" />
                {t('status.available')}
            </div>
        );
    }

    if (state.kind === 'partial') {
        return (
            <div className={`${pillClass} bg-amber-500/95 text-white border-amber-300/40`} title={title}>
                <Layers className="w-3 h-3" />
                {t('status.partial')}
            </div>
        );
    }

    if (state.kind === 'processing') {
        return (
            <div className={`${pillClass} bg-blue-500/95 text-white border-blue-400/30`} title={title}>
                <Download className="w-3 h-3" />
                {t('status.processing')}
            </div>
        );
    }

    if (state.kind === 'requested') {
        return (
            <div className={`${pillClass} bg-indigo-500/95 text-white border-indigo-400/30`} title={title}>
                <Clock className="w-3 h-3" />
                {t('status.requested')}
            </div>
        );
    }

    if (state.kind === 'pending') {
        return (
            <div className={`${pillClass} bg-amber-500/95 text-white border-amber-400/30`} title={title}>
                <Clock className="w-3 h-3" />
                {t('status.pending')}
            </div>
        );
    }

    if (state.kind === 'failed') {
        return (
            <div className={`${pillClass} bg-red-500/95 text-white border-red-400/30`} title={title}>
                <AlertCircle className="w-3 h-3" />
                {t('status.failed')}
            </div>
        );
    }

    if (state.kind === 'declined') {
        return (
            <div className={`${pillClass} bg-red-500/90 text-white border-red-400/30`} title={title}>
                <XCircle className="w-3 h-3" />
                {t('status.declined')}
            </div>
        );
    }

    if (state.kind === 'blacklisted') {
        return (
            <div className={`${pillClass} bg-zinc-700/95 text-white border-white/20`} title={title}>
                <Ban className="w-3 h-3" />
                {t('status.blacklisted')}
            </div>
        );
    }

    return null;
};

export const mediaStatusPanelClass = (kind: MediaAvailabilityState['kind']) => {
    if (kind === 'upToDate') return 'border-sky-500/30 bg-sky-500/10 text-sky-100';
    if (kind === 'available') return 'border-green-500/25 bg-green-500/10 text-green-200';
    if (kind === 'partial') return 'border-amber-500/30 bg-amber-500/10 text-amber-100';
    if (kind === 'processing') return 'border-blue-500/25 bg-blue-500/10 text-blue-100';
    if (kind === 'requested') return 'border-indigo-500/25 bg-indigo-500/10 text-indigo-100';
    if (kind === 'pending') return 'border-amber-500/25 bg-amber-500/10 text-amber-100';
    if (kind === 'failed' || kind === 'declined') return 'border-red-500/25 bg-red-500/10 text-red-100';
    if (kind === 'blacklisted') return 'border-white/15 bg-white/5 text-white/60';
    return 'border-white/10 bg-white/[0.03] text-white/70';
};

export const MediaStatusPanel: React.FC<{
    state: MediaAvailabilityState;
    onViewRequests?: () => void;
    onRetry?: () => void;
    libraryAction?: React.ReactNode;
    arrAction?: React.ReactNode;
}> = ({ state, onViewRequests, onRetry, libraryAction, arrAction }) => {
    const { t } = useDiscoverI18n();
    if (state.kind === 'none') return null;

    return (
        <div className={`rounded-xl border px-4 py-3 flex flex-col gap-3 ${mediaStatusPanelClass(state.kind)}`}>
            <div className="min-w-0">
                <p className="text-sm font-bold">{translateDiscoverStatus(t, state.label)}</p>
                {state.detail && (
                    <p className="text-xs opacity-80 mt-0.5 leading-relaxed">{state.detail}</p>
                )}
            </div>
            {(onRetry || onViewRequests || libraryAction || arrAction) && (
                <div className="flex flex-col gap-2 w-full">
                    {state.kind === 'failed' && onRetry && (
                        <button
                            type="button"
                            onClick={onRetry}
                            className="w-full px-3 py-2 rounded-lg bg-white/10 hover:bg-white/15 text-xs font-bold transition-colors text-center"
                        >
                            {t('media.retryRequest')}
                        </button>
                    )}
                    {state.hasUserRequest && onViewRequests && (
                        <button
                            type="button"
                            onClick={onViewRequests}
                            className="w-full px-3 py-2 rounded-lg bg-white/10 hover:bg-white/15 text-xs font-bold transition-colors text-center"
                        >
                            {t('media.viewInMyRequests')}
                        </button>
                    )}
                    {libraryAction}
                    {arrAction}
                </div>
            )}
        </div>
    );
};
