import { memo, useMemo } from 'react';

import { formatSizeCeil } from '../../shared/format';
import { CountUp } from './CountUp';
import type { AnalyticsData } from './useAnalyticsData';

type LibraryHealth = NonNullable<AnalyticsData['libraryHealth']>;

const LibraryDeltaBadge = ({ value }: { value?: number }) => {
    if (!value) return null;
    const isPositive = value > 0;
    return (
        <span
            className={`text-sm font-bold ml-2 ${isPositive ? 'text-green-500' : 'text-red-500'} animate-[fade-in_0.5s_ease-out] cursor-help`}
            title="Added since the last daily library scan"
        >
            {isPositive ? '+' : ''}{value.toLocaleString()}
        </span>
    );
};

const useLibraryHealthDistributions = (libraryHealth: LibraryHealth) => useMemo(() => {
    if (!libraryHealth.resolutions || !libraryHealth.codecs || !libraryHealth.fileSizes) return null;

    const sortedCodecs = Object.entries(libraryHealth.codecs)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count);
    const totalCodecs = sortedCodecs.reduce((sum, item) => sum + item.count, 0) || 1;
    const sortedResolutions = Object.entries(libraryHealth.resolutions)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count);
    const totalResolutions = sortedResolutions.reduce((sum, item) => sum + item.count, 0) || 1;
    const fileSizeEntries = Object.entries(libraryHealth.fileSizes).map(([range, value]) => {
        const movies = value && typeof value === 'object' ? Number(value.movies) || 0 : 0;
        const shows = value && typeof value === 'object' ? Number(value.shows) || 0 : typeof value === 'number' ? value : 0;
        return { range, movies, shows, total: movies + shows };
    });
    const maxFileSizeCount = Math.max(...fileSizeEntries.map((entry) => entry.total), 1);

    return { sortedCodecs, totalCodecs, sortedResolutions, totalResolutions, fileSizeEntries, maxFileSizeCount };
}, [libraryHealth]);

const DistributionList = ({
    items,
    title,
    total,
}: {
    items: Array<{ name: string; count: number }>;
    title: string;
    total: number;
}) => (
    <div className="glass-card-sm p-5 flex flex-col justify-between">
        <div>
            <h3 className="text-muted text-xs uppercase tracking-wider font-bold mb-4">{title}</h3>
            <div className="flex flex-col gap-3">
                {items.map((item) => {
                    const percent = Math.round((item.count / total) * 100);
                    return (
                        <div key={item.name} className="flex flex-col gap-1">
                            <div className="flex justify-between text-xs font-semibold">
                                <span className="text-text">{item.name}</span>
                                <span className="text-muted font-mono">{item.count.toLocaleString()} ({percent}%)</span>
                            </div>
                            <div className="w-full bg-white/5 h-2 rounded-full overflow-hidden">
                                <div className="bg-plex h-full rounded-full transition-all duration-500" style={{ width: `${percent}%` }} />
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    </div>
);

export const AnalyticsLibraryHealth = memo(({ libraryHealth }: { libraryHealth: LibraryHealth }) => {
    const distributions = useLibraryHealthDistributions(libraryHealth);
    const deltas = libraryHealth.deltas || {};

    return (
        <>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="glass-card-sm p-4">
                    <p className="text-muted text-xs uppercase tracking-wider font-bold mb-1">Library Balance</p>
                    <p className="text-xl font-black text-plex">{libraryHealth.healthLabel}</p>
                    <p className="text-[10px] text-muted mt-1 leading-snug">How evenly viewing is spread across libraries — not server health.</p>
                </div>
                <div className="glass-card-sm p-4">
                    <p className="text-muted text-xs uppercase tracking-wider font-bold mb-1">Active Libraries</p>
                    <p className="text-xl font-black text-text">{libraryHealth.activeLibraries}</p>
                </div>
                <div className="glass-card-sm p-4">
                    <p className="text-muted text-xs uppercase tracking-wider font-bold mb-1">Catalog Size</p>
                    <p className="text-xl font-black text-text">{libraryHealth.totalCatalogItems.toLocaleString()}</p>
                    <p className="text-[11px] text-muted">{formatSizeCeil(libraryHealth.totalCatalogBytes ?? libraryHealth.sizeGB * 1024 ** 3)}</p>
                </div>
                <div className="glass-card-sm p-4">
                    <p className="text-muted text-xs uppercase tracking-wider font-bold mb-1">Usage Concentration</p>
                    <p className="text-xl font-black text-text">{libraryHealth.concentrationPct}%</p>
                    <p className="text-[11px] text-muted truncate">Watched: {libraryHealth.catalogWatchedPct || 0}% • 4K: {libraryHealth.fourKPercent}%</p>
                </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="glass-card-sm p-4 flex flex-col justify-center">
                    <p className="text-muted text-xs uppercase tracking-wider font-bold mb-1">Movies Catalog</p>
                    <div className="flex items-center">
                        <p className="text-xl font-black text-text"><CountUp end={libraryHealth.movies || 0} /></p>
                        <LibraryDeltaBadge value={deltas.movies} />
                    </div>
                    <p className="text-[11px] text-muted">Total movies in library</p>
                </div>
                <div className="glass-card-sm p-4 flex flex-col justify-center">
                    <p className="text-muted text-xs uppercase tracking-wider font-bold mb-1">TV Shows Catalog</p>
                    <div className="flex items-center gap-1">
                        <p className="text-xl font-black text-text"><CountUp end={libraryHealth.shows || 0} /></p>
                        <span className="text-xs font-semibold text-muted ml-1">Shows</span>
                        <LibraryDeltaBadge value={deltas.shows} />
                    </div>
                    <div className="flex items-center text-[11px] text-muted mt-0.5">
                        <CountUp end={libraryHealth.episodes || 0} /> <span className="ml-1">episodes</span>
                        <LibraryDeltaBadge value={deltas.episodes} />
                    </div>
                </div>
                <div className="glass-card-sm p-4 flex flex-col justify-center">
                    <p className="text-muted text-xs uppercase tracking-wider font-bold mb-1">Music Catalog</p>
                    <div className="flex items-center gap-1">
                        <p className="text-xl font-black text-text"><CountUp end={libraryHealth.artists || 0} /></p>
                        <span className="text-xs font-semibold text-muted ml-1">Artists</span>
                        <LibraryDeltaBadge value={deltas.artists} />
                    </div>
                    <div className="flex items-center text-[11px] text-muted mt-0.5">
                        <CountUp end={libraryHealth.albums || 0} /> <span className="mx-1">albums</span> <LibraryDeltaBadge value={deltas.albums} />
                        <span className="mx-1">•</span>
                        <CountUp end={libraryHealth.tracks || 0} /> <span className="mx-1">tracks</span> <LibraryDeltaBadge value={deltas.tracks} />
                    </div>
                </div>
            </div>
            {distributions && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <DistributionList title="Video Codecs" items={distributions.sortedCodecs} total={distributions.totalCodecs} />
                    <DistributionList title="Resolutions" items={distributions.sortedResolutions} total={distributions.totalResolutions} />
                    <div className="glass-card-sm p-5 flex flex-col">
                        <div className="flex items-center justify-between mb-1">
                            <h3 className="text-muted text-xs uppercase tracking-wider font-bold">File Size Distribution</h3>
                            <div className="flex items-center gap-3 text-[10px] text-muted font-semibold">
                                <span className="flex items-center gap-1"><span className="w-2 h-2 bg-plex rounded-sm inline-block" /><span>Movies</span></span>
                                <span className="flex items-center gap-1"><span className="w-2 h-2 bg-plex/30 rounded-sm inline-block border border-plex/20" /><span>TV Shows</span></span>
                            </div>
                        </div>
                        <div className="flex items-end justify-between h-40 pt-4 px-2 w-full gap-3 mt-auto">
                            {distributions.fileSizeEntries.map((item) => {
                                const totalHeightPercent = (item.total / distributions.maxFileSizeCount) * 100;
                                const moviesPercent = item.total > 0 ? (item.movies / item.total) * 100 : 0;
                                const showsPercent = item.total > 0 ? (item.shows / item.total) * 100 : 0;
                                return (
                                    <div key={item.range} className="flex-1 flex flex-col items-center gap-2 h-full justify-end group relative">
                                        <div className="w-full relative transition-all duration-500 flex flex-col justify-end" style={{ height: `${Math.max(totalHeightPercent, 4)}%` }}>
                                            <div className="w-full h-full rounded-t overflow-hidden flex flex-col justify-end">
                                                {item.movies > 0 && <div className="w-full bg-plex hover:opacity-100 transition-opacity" style={{ height: `${moviesPercent}%` }} />}
                                                {item.shows > 0 && <div className="w-full bg-plex/30 hover:opacity-100 transition-opacity border-t border-black/10" style={{ height: `${showsPercent}%` }} />}
                                            </div>
                                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 bg-black/95 text-white text-[10px] px-2.5 py-1.5 rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-20 font-mono shadow-md border border-white/5 flex flex-col gap-0.5 leading-none">
                                                <span className="font-bold text-plex mb-1 text-[11px]">{item.range}</span>
                                                <span className="flex justify-between gap-4"><span>Movies:</span> <span className="text-white font-bold">{item.movies.toLocaleString()}</span></span>
                                                <span className="flex justify-between gap-4"><span>TV Episodes:</span> <span className="text-white font-bold">{item.shows.toLocaleString()}</span></span>
                                                <span className="border-t border-white/10 mt-1 pt-1 flex justify-between gap-4"><span>Total:</span> <span className="text-plex font-bold">{item.total.toLocaleString()}</span></span>
                                            </div>
                                        </div>
                                        <span className="text-[9px] text-muted font-bold tracking-wider text-center line-clamp-1 w-full" title={item.range}>{item.range}</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
});

AnalyticsLibraryHealth.displayName = 'AnalyticsLibraryHealth';
