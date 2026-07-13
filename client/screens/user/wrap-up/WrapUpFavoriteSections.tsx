import { memo } from 'react';
import { Clapperboard, Film, Tv } from 'lucide-react';

import { resolvePortalAssetUrl } from '../../../shared/basePath';
import type { WrapUpAnalyticsSectionProps } from './types';

export const TopBingeSection = memo(function TopBingeSection({ analytics }: WrapUpAnalyticsSectionProps) {
    return (
        <div className="flex flex-col items-center justify-center text-center p-6 relative">
            {analytics.topBinge?.artUrl || analytics.topBinge?.thumbUrl ? (
                <div className="w-full h-40 bg-cover bg-center rounded-xl shadow-lg mb-6 border border-white/10 relative overflow-hidden" style={{ backgroundImage: `url('${resolvePortalAssetUrl(analytics.topBinge.artUrl) || 'https://images.unsplash.com/photo-1594909122845-11baa439b7bf?auto=format&fit=crop&q=80&w=600'}')` }}>
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent"></div>
                    <div className="absolute bottom-4 left-0 right-0 px-4 flex flex-col items-center">
                        <h2 className="text-2xl font-black text-white mb-1 line-clamp-1 drop-shadow-md">{analytics.topBinge?.title || 'Nothing yet'}</h2>
                        <p className="text-plex font-bold drop-shadow-md">{analytics.topBinge?.plays || 0} episodes</p>
                    </div>
                </div>
            ) : (
                <Tv className="w-16 h-16 text-plex mb-6 drop-shadow-lg" />
            )}

            {analytics.topBinge?.summary && (
                <div className="w-full mt-2 mb-4 bg-white/5 border border-white/5 rounded-lg p-4 text-left">
                    <p className="text-gray-300 text-sm leading-relaxed">{analytics.topBinge.summary}</p>
                    {analytics.topBinge.year && <span className="inline-block mt-3 text-xs font-black px-2 py-1 bg-black/40 rounded text-gray-400">{analytics.topBinge.year}</span>}
                </div>
            )}

            {analytics.topShows && analytics.topShows.length > 1 ? (
                <div className="w-full mt-2">
                    <p className="text-left text-xs uppercase tracking-widest font-bold text-muted mb-3 border-b border-white/10 pb-2">Runner Ups</p>
                    <div className="flex flex-col gap-2">
                        {analytics.topShows.slice(1).map((show: any, i: number) => (
                            <div key={i} className="flex items-center justify-between bg-white/5 border border-white/5 rounded-lg p-2 hover:bg-white/10 transition-colors">
                                <div className="flex items-center gap-3">
                                    <span className="text-gray-500 font-bold w-4 text-right">{i + 2}</span>
                                    {show.thumbUrl ? <img src={resolvePortalAssetUrl(show.thumbUrl)} className="w-8 h-12 object-cover rounded shadow-sm" /> : <div className="w-8 h-12 bg-white/10 rounded"></div>}
                                    <span className="font-bold text-sm text-gray-200 line-clamp-1 text-left">{show.title}</span>
                                </div>
                                <span className="text-xs font-black text-plex whitespace-nowrap">{show.plays} eps</span>
                            </div>
                        ))}
                    </div>
                </div>
            ) : (
                <div className="w-full mt-2 py-6 border border-dashed border-white/10 rounded-xl flex flex-col items-center justify-center opacity-50">
                    <Tv className="w-8 h-8 text-gray-500 mb-2" />
                    <p className="text-sm font-bold text-gray-400">No other shows watched</p>
                </div>
            )}
        </div>
    );
});

export const TopMovieSection = memo(function TopMovieSection({ analytics }: WrapUpAnalyticsSectionProps) {
    return (
        <div className="flex flex-col items-center justify-center text-center p-6 relative">
            {analytics.topMovie?.artUrl || analytics.topMovie?.thumbUrl ? (
                <div className="w-full h-40 bg-cover bg-center rounded-xl shadow-lg mb-6 border border-white/10 relative overflow-hidden" style={{ backgroundImage: `url('${resolvePortalAssetUrl(analytics.topMovie.artUrl) || 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?auto=format&fit=crop&q=80&w=600'}')` }}>
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent"></div>
                    <div className="absolute bottom-4 left-0 right-0 px-4 flex flex-col items-center">
                        <h2 className="text-2xl font-black text-white mb-1 line-clamp-1 drop-shadow-md">{analytics.topMovie?.title || 'Nothing yet'}</h2>
                        <p className="text-plex font-bold drop-shadow-md">{analytics.topMovie?.plays || 0} plays</p>
                    </div>
                </div>
            ) : (
                <Clapperboard className="w-16 h-16 text-plex mb-6 drop-shadow-lg" />
            )}

            {analytics.topMovie?.summary && (
                <div className="w-full mt-2 mb-4 bg-white/5 border border-white/5 rounded-lg p-4 text-left">
                    {analytics.topMovie.tagline && <p className="italic text-plex text-xs mb-2 font-bold">"{analytics.topMovie.tagline}"</p>}
                    <p className="text-gray-300 text-sm leading-relaxed">{analytics.topMovie.summary}</p>
                    {analytics.topMovie.year && <span className="inline-block mt-3 text-xs font-black px-2 py-1 bg-black/40 rounded text-gray-400">{analytics.topMovie.year}</span>}
                </div>
            )}

            {analytics.topMovies && analytics.topMovies.length > 1 ? (
                <div className="w-full mt-2">
                    <p className="text-left text-xs uppercase tracking-widest font-bold text-muted mb-3 border-b border-white/10 pb-2">Runner Ups</p>
                    <div className="flex flex-col gap-2">
                        {analytics.topMovies.slice(1).map((movie: any, i: number) => (
                            <div key={i} className="flex items-center justify-between bg-white/5 border border-white/5 rounded-lg p-2 hover:bg-white/10 transition-colors">
                                <div className="flex items-center gap-3">
                                    <span className="text-gray-500 font-bold w-4 text-right">{i + 2}</span>
                                    {movie.thumbUrl ? <img src={resolvePortalAssetUrl(movie.thumbUrl)} className="w-8 h-12 object-cover rounded shadow-sm" /> : <div className="w-8 h-12 bg-white/10 rounded"></div>}
                                    <span className="font-bold text-sm text-gray-200 line-clamp-1 text-left">{movie.title}</span>
                                </div>
                                <span className="text-xs font-black text-plex whitespace-nowrap">{movie.plays} plays</span>
                            </div>
                        ))}
                    </div>
                </div>
            ) : (
                <div className="w-full mt-2 py-6 border border-dashed border-white/10 rounded-xl flex flex-col items-center justify-center opacity-50">
                    <Film className="w-8 h-8 text-gray-500 mb-2" />
                    <p className="text-sm font-bold text-gray-400">No other movies watched</p>
                </div>
            )}
        </div>
    );
});
