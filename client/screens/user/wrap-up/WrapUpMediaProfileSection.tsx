import { memo } from 'react';
import { PieChart } from 'lucide-react';

import { resolvePortalAssetUrl } from '../../../shared/basePath';
import type { WrapUpAnalyticsSectionProps } from './types';

export const MediaProfileSection = memo(function MediaProfileSection({ analytics }: WrapUpAnalyticsSectionProps) {
    const total = analytics.totalPlays || 1;
    const movies = analytics.moviesCount || 0;
    const shows = analytics.showsCount || 0;
    const music = analytics.musicCount || 0;
    const moviePct = Math.round((movies / total) * 100);
    const showPct = Math.round((shows / total) * 100);
    const musicPct = Math.round((music / total) * 100);
    const topMoviesList: any[] = (analytics.topMovies || []).slice(0, 3);
    const topShowsList: any[] = (analytics.topShows || []).slice(0, 3);
    const profileDesc = analytics.mediaPreference === 'Movie Buff'
        ? 'You love the big screen experience. Movies are your go-to comfort.'
        : analytics.mediaPreference === 'TV Show Binger'
            ? 'You\'re a serial binger — once you start a show, you see it through.'
            : analytics.mediaPreference === 'Music Lover'
                ? 'Music is your thing — you\'re always on the listening grind.'
                : 'You keep things varied. A bit of everything keeps it interesting.';

    return (
        <div className="flex flex-col items-center justify-center text-center p-6">
            <PieChart className="w-14 h-14 text-plex mb-3 drop-shadow-lg" />
            <h2 className="text-3xl font-black text-white mb-1">{analytics.mediaPreference || 'Mixed Bag'}</h2>
            <p className="text-muted mb-2 uppercase tracking-widest text-xs font-bold">Content Breakdown</p>
            <p className="text-gray-400 text-sm mb-5 italic">{profileDesc}</p>

            <div className="w-full flex flex-col gap-4 mb-5">
                <div>
                    <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider mb-1.5">
                        <span className="text-blue-400 flex items-center gap-1.5">🎬 Movies</span>
                        <span className="text-gray-300">{movies} <span className="text-gray-500 font-normal">({moviePct}%)</span></span>
                    </div>
                    <div className="w-full bg-black/60 rounded-full h-3 overflow-hidden shadow-inner border border-white/5">
                        <div className="bg-gradient-to-r from-blue-600 to-blue-400 h-full rounded-full shadow-[0_0_10px_rgba(59,130,246,0.5)] transition-all duration-1000" style={{ width: `${moviePct}%` }} />
                    </div>
                </div>
                <div>
                    <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider mb-1.5">
                        <span className="text-green-400 flex items-center gap-1.5">📺 Shows</span>
                        <span className="text-gray-300">{shows} <span className="text-gray-500 font-normal">({showPct}%)</span></span>
                    </div>
                    <div className="w-full bg-black/60 rounded-full h-3 overflow-hidden shadow-inner border border-white/5">
                        <div className="bg-gradient-to-r from-green-600 to-green-400 h-full rounded-full shadow-[0_0_10px_rgba(34,197,94,0.5)] transition-all duration-1000" style={{ width: `${showPct}%` }} />
                    </div>
                </div>
                {music > 0 && (
                    <div>
                        <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider mb-1.5">
                            <span className="text-purple-400 flex items-center gap-1.5">🎵 Music</span>
                            <span className="text-gray-300">{music} <span className="text-gray-500 font-normal">({musicPct}%)</span></span>
                        </div>
                        <div className="w-full bg-black/60 rounded-full h-3 overflow-hidden shadow-inner border border-white/5">
                            <div className="bg-gradient-to-r from-purple-600 to-purple-400 h-full rounded-full shadow-[0_0_10px_rgba(168,85,247,0.5)] transition-all duration-1000" style={{ width: `${musicPct}%` }} />
                        </div>
                    </div>
                )}
            </div>

            {(topMoviesList.length > 0 || topShowsList.length > 0) && (
                <div className="w-full">
                    <p className="text-left text-xs uppercase tracking-widest font-bold text-muted mb-3 border-b border-white/10 pb-2">Top Picks This Period</p>
                    <div className="flex flex-col gap-2">
                        {topMoviesList.length > 0 && (
                            <>
                                <p className="text-left text-[9px] text-blue-400 font-black uppercase tracking-widest mt-1">🎬 Movies</p>
                                {topMoviesList.map((movie: any, i: number) => (
                                    <div key={i} className="flex items-center gap-3 bg-white/5 border border-white/5 rounded-lg p-2 hover:bg-white/10 transition-colors">
                                        <span className="text-gray-500 font-black text-xs w-4 text-right flex-shrink-0">{i + 1}</span>
                                        {movie.thumbUrl
                                            ? <img src={resolvePortalAssetUrl(movie.thumbUrl)} className="w-8 h-12 object-cover rounded shadow-sm flex-shrink-0" />
                                            : <div className="w-8 h-12 bg-white/10 rounded flex-shrink-0" />}
                                        <div className="flex flex-col text-left overflow-hidden">
                                            <span className="font-bold text-sm text-gray-200 truncate">{movie.title}</span>
                                            <span className="text-[10px] text-gray-400">{movie.plays} play{movie.plays !== 1 ? 's' : ''}</span>
                                        </div>
                                    </div>
                                ))}
                            </>
                        )}
                        {topShowsList.length > 0 && (
                            <>
                                <p className="text-left text-[9px] text-green-400 font-black uppercase tracking-widest mt-2">📺 Shows</p>
                                {topShowsList.map((show: any, i: number) => (
                                    <div key={i} className="flex items-center gap-3 bg-white/5 border border-white/5 rounded-lg p-2 hover:bg-white/10 transition-colors">
                                        <span className="text-gray-500 font-black text-xs w-4 text-right flex-shrink-0">{i + 1}</span>
                                        {show.thumbUrl
                                            ? <img src={resolvePortalAssetUrl(show.thumbUrl)} className="w-8 h-12 object-cover rounded shadow-sm flex-shrink-0" />
                                            : <div className="w-8 h-12 bg-white/10 rounded flex-shrink-0" />}
                                        <div className="flex flex-col text-left overflow-hidden">
                                            <span className="font-bold text-sm text-gray-200 truncate">{show.title}</span>
                                            <span className="text-[10px] text-gray-400">{show.plays} episode{show.plays !== 1 ? 's' : ''}</span>
                                        </div>
                                    </div>
                                ))}
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
});
