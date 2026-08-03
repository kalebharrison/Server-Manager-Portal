import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpCircle, CircleHelp, DownloadCloud, Film, Music, Sparkles, Tv } from 'lucide-react';

import { apiFetch } from '../shared/api';
import { discoverPosterGridClass } from '../shared/portalLayout';
import { ScrollReveal } from '../shared/ui';
import { useVisibleInterval } from '../shared/useVisibleInterval';
import { discoveryTheme } from '../discovery/discoveryThemeClasses';
import { groupOnTheWayDownloads } from '../../lib/media-stack/on-the-way-group.js';
import { mapQueueRecords } from './media-stack/mediaStackUtils';
import { PosterImage } from './DiscoverContent';

const queueRecords = (queue: any) => (
    Array.isArray(queue?.records) ? queue.records : Array.isArray(queue) ? queue : []
);

const phaseClass = (phase: string) => {
    const value = phase.toLowerCase();
    if (value.includes('stalled') || value.includes('failed') || value.includes('attention')) return 'bg-red-500/20 text-red-200 border-red-500/30';
    if (value.includes('waiting') || value.includes('paused')) return 'bg-amber-500/20 text-amber-100 border-amber-500/30';
    if (value.includes('import')) return 'bg-green-500/20 text-green-200 border-green-500/30';
    return 'bg-plex/20 text-plex border-plex/30';
};

const DownloadPosterCard: React.FC<{ item: any; className?: string }> = ({ item, className }) => {
    const TypeIcon = item.type === 'tv' ? Tv : item.type === 'music' ? Music : Film;
    const AcquisitionIcon = item.acquisitionKind === 'upgrade' ? ArrowUpCircle : item.acquisitionKind === 'new' ? Sparkles : CircleHelp;
    const acquisitionClass = item.acquisitionKind === 'upgrade'
        ? 'bg-violet-700/85 border-violet-300/25'
        : item.acquisitionKind === 'new'
            ? 'bg-emerald-700/85 border-emerald-300/25'
            : 'bg-slate-700/85 border-slate-300/25';

    return (
        <article className={`flex flex-col gap-2 group ${className || ''}`.trim()}>
            <div className="relative rounded-lg overflow-hidden border border-border bg-background shadow-md">
                <div className="aspect-[2/3] w-full">
                    {item.imageUrl ? (
                        <PosterImage src={item.imageUrl} alt={item.title} />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center p-4 text-center bg-white/5">
                            <DownloadCloud className="w-8 h-8 text-muted/50" />
                        </div>
                    )}
                </div>
                <div className="absolute top-2 left-2 flex flex-wrap gap-1">
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-black/75 text-[8px] font-bold uppercase tracking-wide text-white border border-white/10">
                        <TypeIcon className="w-2.5 h-2.5" />
                        {item.kindLabel}
                    </span>
                </div>
                <span className={`absolute top-2 right-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[8px] font-bold uppercase tracking-wide text-white border ${acquisitionClass}`}>
                    <AcquisitionIcon className="w-2.5 h-2.5" />
                    {item.acquisitionLabel}
                </span>
                <div className="absolute bottom-0 left-0 right-0 bg-black/75 backdrop-blur-sm p-1.5">
                    <div className="flex items-center justify-between gap-1 text-[9px] font-bold mb-1">
                        <span className={`px-1 py-0.5 rounded border truncate ${phaseClass(item.phase)}`}>{item.phase}</span>
                        <span className="text-white/80 shrink-0">{item.progress.toFixed(0)}%</span>
                    </div>
                    <div className="h-1 bg-white/10 rounded-full overflow-hidden">
                        <div className="h-full bg-plex rounded-full transition-all duration-500" style={{ width: `${item.progress}%` }} />
                    </div>
                </div>
            </div>
            <div className="text-[11px] font-medium line-clamp-2 leading-tight text-white text-center">
                {item.title}
            </div>
            {item.subtitle ? <div className="text-[10px] text-muted text-center line-clamp-1">{item.subtitle}</div> : null}
        </article>
    );
};

type Props = {
    useScrollRevealAnimations?: boolean;
    /** `rail` = compact wrapping grid on Discover Home; `grid` = full poster grid. */
    layout?: 'grid' | 'rail';
};

export const DiscoverDownloadsSection: React.FC<Props> = ({
    useScrollRevealAnimations,
    layout = 'grid',
}) => {
    const [downloads, setDownloads] = useState<any[]>([]);
    const [loaded, setLoaded] = useState(false);
    const initialLoadRef = useRef(true);
    const isRail = layout === 'rail';

    const loadDownloads = useCallback(async () => {
        const forceRefresh = initialLoadRef.current;
        initialLoadRef.current = false;
        try {
            const queue = await apiFetch('/api/media-stack/queue', { cacheTtlMs: 15_000, forceRefresh });
            const next = groupOnTheWayDownloads([
                ...mapQueueRecords(queueRecords(queue?.sonarr?.queue), 'Sonarr'),
                ...mapQueueRecords(queueRecords(queue?.radarr?.queue), 'Radarr'),
                ...mapQueueRecords(queueRecords(queue?.lidarr?.queue), 'Lidarr'),
            ].filter((item) => item.hasMediaTitle && item.progress >= 0 && item.progress < 100));
            setDownloads(next);
        } catch {
            setDownloads([]);
        } finally {
            setLoaded(true);
        }
    }, []);

    useEffect(() => {
        loadDownloads();
    }, [loadDownloads]);

    useVisibleInterval(loadDownloads, 15_000);

    const visibleDownloads = useMemo(() => downloads.slice(0, 20), [downloads]);

    const title = isRail ? (
        <h2 className={`${discoveryTheme.sectionTitle} px-2`}>On the way</h2>
    ) : (
        <h2 className="text-plex text-sm uppercase tracking-[2px] mb-5 font-bold border-b border-white/10 pb-2">ON THE WAY</h2>
    );

    if (!loaded) {
        return (
            <div className={`flex flex-col gap-2 ${isRail ? '' : 'discover-deferred-section'}`}>
                {title}
                <div className="rounded-xl border border-dashed border-border p-4 text-center text-sm text-muted mx-2">
                    Checking downloads…
                </div>
            </div>
        );
    }
    if (!visibleDownloads.length) return null;

    if (isRail) {
        return (
            <div className="flex flex-col gap-2 relative">
                {title}
                <div
                    className="grid gap-2 px-2"
                    style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(5.5rem, 1fr))' }}
                >
                    {visibleDownloads.map((item) => (
                        <DownloadPosterCard key={item.id} item={item} />
                    ))}
                </div>
            </div>
        );
    }

    return (
        <ScrollReveal enabled={!!useScrollRevealAnimations} className="flex flex-col discover-deferred-section discover-layout-container">
            {title}
            <div className={discoverPosterGridClass}>
                {visibleDownloads.map((item) => <DownloadPosterCard key={item.id} item={item} />)}
            </div>
        </ScrollReveal>
    );
};
