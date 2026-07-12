import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowUpCircle, CircleHelp, DownloadCloud, Film, Sparkles, Tv } from 'lucide-react';

import { apiFetch } from '../shared/api';
import { discoverPosterGridClass } from '../shared/portalLayout';
import { ScrollReveal } from '../shared/ui';
import { useVisibleInterval } from '../shared/useVisibleInterval';
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

const DownloadPosterCard: React.FC<{ item: any }> = ({ item }) => {
    const TypeIcon = item.type === 'tv' ? Tv : Film;
    const AcquisitionIcon = item.acquisitionKind === 'upgrade' ? ArrowUpCircle : item.acquisitionKind === 'new' ? Sparkles : CircleHelp;
    const acquisitionClass = item.acquisitionKind === 'upgrade'
        ? 'bg-violet-700/85 border-violet-300/25'
        : item.acquisitionKind === 'new'
            ? 'bg-emerald-700/85 border-emerald-300/25'
            : 'bg-slate-700/85 border-slate-300/25';

    return (
        <article className="flex flex-col gap-2 group">
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
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-black/75 text-[9px] font-bold uppercase tracking-wide text-white border border-white/10">
                        <TypeIcon className="w-3 h-3" />
                        {item.kindLabel}
                    </span>
                </div>
                <span className={`absolute top-2 right-2 inline-flex items-center gap-1 px-2 py-1 rounded-md text-[9px] font-bold uppercase tracking-wide text-white border ${acquisitionClass}`}>
                    <AcquisitionIcon className="w-3 h-3" />
                    {item.acquisitionLabel}
                </span>
                <div className="absolute bottom-0 left-0 right-0 bg-black/75 backdrop-blur-sm p-2">
                    <div className="flex items-center justify-between gap-2 text-[10px] font-bold mb-1">
                        <span className={`px-1.5 py-0.5 rounded border ${phaseClass(item.phase)}`}>{item.phase}</span>
                        <span className="text-white/80">{item.progress.toFixed(0)}%</span>
                    </div>
                    <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                        <div className="h-full bg-plex rounded-full transition-all duration-500" style={{ width: `${item.progress}%` }} />
                    </div>
                </div>
            </div>
            <div className="text-xs font-medium line-clamp-2 leading-tight text-white text-center mt-1">
                {item.title}
            </div>
            {item.subtitle ? <div className="text-[10px] text-muted text-center line-clamp-1">{item.subtitle}</div> : null}
        </article>
    );
};

export const DiscoverDownloadsSection: React.FC<{ useScrollRevealAnimations?: boolean }> = ({ useScrollRevealAnimations }) => {
    const [downloads, setDownloads] = useState<any[]>([]);

    const loadDownloads = useCallback(async () => {
        try {
            const summary = await apiFetch('/api/media-stack/summary?monthOffset=0', { cacheTtlMs: 15_000 });
            const next = [
                ...mapQueueRecords(queueRecords(summary?.sonarr?.queue), 'Sonarr'),
                ...mapQueueRecords(queueRecords(summary?.radarr?.queue), 'Radarr'),
            ].filter((item) => item.hasMediaTitle && item.progress >= 0);
            setDownloads(next);
        } catch {
            setDownloads([]);
        }
    }, []);

    useEffect(() => {
        loadDownloads();
    }, [loadDownloads]);

    useVisibleInterval(loadDownloads, 30000);

    const visibleDownloads = useMemo(() => downloads.slice(0, 20), [downloads]);
    if (!visibleDownloads.length) return null;

    return (
        <ScrollReveal enabled={!!useScrollRevealAnimations} className="flex flex-col mb-12 discover-deferred-section">
            <h2 className="text-plex text-sm uppercase tracking-[2px] mb-6 font-bold border-b border-white/10 pb-2">ON THE WAY</h2>
            <div className={discoverPosterGridClass}>
                {visibleDownloads.map((item) => <DownloadPosterCard key={item.id} item={item} />)}
            </div>
        </ScrollReveal>
    );
};
