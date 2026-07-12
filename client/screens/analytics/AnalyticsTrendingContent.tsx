import React, { useMemo, useState } from 'react';
import { Film, PlaySquare, Star, TrendingUp } from 'lucide-react';

import { resolvePortalAssetUrl } from '../../shared/basePath';
import { PosterImage } from '../DiscoverContent';

type ContentTab = 'movies' | 'shows' | 'music';

export const AnalyticsTrendingContent: React.FC<{
    movies: any[];
    shows: any[];
    music: any[];
}> = ({ movies, shows, music }) => {
    const [tab, setTab] = useState<ContentTab>('movies');
    const items = useMemo(() => tab === 'shows' ? shows : tab === 'music' ? music : movies, [movies, music, shows, tab]);

    return (
        <div className="glass-card-sm p-4 md:p-6 col-span-full">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4">
                <h2 className="text-xl font-bold text-text uppercase tracking-wider flex items-center gap-2"><TrendingUp className="text-plex w-5 h-5" /> Trending Content</h2>
                <div className="flex items-center gap-2 bg-black/30 p-1 rounded-lg border border-border">
                    {([
                        ['movies', 'Movies'],
                        ['shows', 'TV Shows'],
                        ['music', 'Music'],
                    ] as const).map(([value, label]) => (
                        <button key={value} onClick={() => setTab(value)} className={`px-4 py-1.5 rounded-md text-sm font-bold transition-all ${tab === value ? 'bg-plex text-black shadow-md' : 'text-muted hover:text-text hover:bg-white/5'}`}>{label}</button>
                    ))}
                </div>
            </div>
            <div className="flex flex-col gap-4">
                {items.length === 0 ? <p className="text-muted text-sm">No data available.</p> : items.slice(0, 10).map((item, index) => (
                    <a key={item.key} href={item.plexUrl} target="_blank" rel="noreferrer" className="flex flex-col sm:flex-row bg-black/20 rounded-xl overflow-hidden hover:bg-black/40 transition-all cursor-pointer group hover:ring-1 hover:ring-plex shadow-md">
                        <div className={`sm:w-32 lg:w-40 flex-shrink-0 relative ${tab === 'music' ? 'aspect-square' : 'aspect-[2/3]'}`}>
                            {item.thumbUrl ? (
                                <PosterImage src={resolvePortalAssetUrl(item.thumbUrl)} alt={item.title} />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center bg-black/40"><Film className="w-8 h-8 opacity-50 text-muted" /></div>
                            )}
                            <div className="absolute top-2 left-2 bg-plex text-black font-bold text-xs px-2 py-1 rounded-md shadow-lg">#{index + 1}</div>
                        </div>
                        <div className="p-4 sm:p-5 flex flex-col justify-between flex-grow min-w-0">
                            <div>
                                <div className="flex items-start justify-between gap-2 mb-2">
                                    <h3 className="text-lg sm:text-xl font-bold text-text group-hover:text-plex transition-colors line-clamp-1">{item.title}</h3>
                                    <div className="flex items-center gap-1 bg-white/10 px-2 py-1 rounded-md text-xs font-mono text-plex flex-shrink-0 whitespace-nowrap">
                                        <PlaySquare className="w-3 h-3" /> {item.plays} plays
                                    </div>
                                </div>
                                <div className="flex flex-wrap items-center gap-2 text-xs text-muted mb-3 font-medium">
                                    {item.year && <span>{item.year}</span>}
                                    {item.contentRating && <span>{item.contentRating}</span>}
                                    {item.duration > 0 && <span>{Math.round(item.duration / 60000)} min</span>}
                                    {item.rating && <span className="flex items-center gap-1 text-yellow-500"><Star className="w-3 h-3 fill-current" /> {item.rating}</span>}
                                </div>
                                <p className="text-sm text-text/80 line-clamp-2 sm:line-clamp-3 mb-3 leading-relaxed">{item.summary || 'No summary available.'}</p>
                            </div>
                            {item.genres?.length > 0 && (
                                <div className="flex flex-wrap gap-2 mt-auto">
                                    {item.genres.slice(0, 4).map((genre: string) => <span key={genre} className="text-[10px] uppercase tracking-wider bg-white/5 border border-white/10 text-muted px-2 py-1 rounded-full">{genre}</span>)}
                                    {item.genres.length > 4 && <span className="text-[10px] uppercase tracking-wider bg-white/5 border border-white/10 text-muted px-2 py-1 rounded-full">+{item.genres.length - 4}</span>}
                                </div>
                            )}
                        </div>
                    </a>
                ))}
            </div>
        </div>
    );
};
