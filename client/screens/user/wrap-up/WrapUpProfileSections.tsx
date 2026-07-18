import { memo } from 'react';
import { Coffee, Compass } from 'lucide-react';

import { resolvePortalAssetUrl } from '../../../shared/basePath';
import type { WrapUpAnalyticsSectionProps } from './types';

export { MediaProfileSection } from './WrapUpMediaProfileSection';

export const WatchStyleSection = memo(function WatchStyleSection({ analytics }: WrapUpAnalyticsSectionProps) {
    const discoveryPlays = analytics.uniqueTitles || 0;
    const rewatchPlays = Math.max(0, (analytics.totalPlays || 0) - discoveryPlays);

    return (
        <div className="flex flex-col items-center justify-center text-center p-6">
            <Compass className="w-16 h-16 text-plex mb-4 drop-shadow-lg" />
            <h2 className="text-3xl font-black text-white mb-2">{analytics.watchStyle || 'Unknown'}</h2>
            <p className="text-muted mb-6 uppercase tracking-widest text-xs font-bold">Discovery vs Rewatch</p>

            <div className="w-full relative h-4 rounded-full overflow-hidden flex shadow-inner bg-black/50 border border-white/10 mb-2 mt-2">
                <div className="h-full bg-gradient-to-r from-plex to-orange-400 flex items-center justify-center transition-all duration-1000 shadow-[inset_0_0_20px_rgba(0,0,0,0.3)] relative overflow-hidden" style={{ width: `${(discoveryPlays / Math.max(analytics.totalPlays || 1, 1)) * 100}%` }}></div>
                <div className="h-full bg-gradient-to-r from-blue-600 to-blue-400 flex items-center justify-center transition-all duration-1000 shadow-[inset_0_0_20px_rgba(0,0,0,0.3)] relative overflow-hidden" style={{ width: `${(rewatchPlays / Math.max(analytics.totalPlays || 1, 1)) * 100}%` }}></div>
            </div>
            <div className="flex justify-between w-full px-2 mb-6 text-[10px] font-black uppercase tracking-wider">
                <span className="text-plex">{discoveryPlays} New</span>
                <span className="text-blue-400">{rewatchPlays} Rewatches</span>
            </div>

            <div className="grid grid-cols-2 gap-4 w-full mb-6">
                <div className="bg-gradient-to-b from-white/10 to-white/5 border border-white/10 rounded-xl p-4 flex flex-col items-center justify-center shadow-lg">
                    <span className="text-3xl font-black text-white mb-1 drop-shadow">{analytics.totalPlays || 0}</span>
                    <span className="text-[9px] text-muted uppercase tracking-widest font-black">Total Plays</span>
                </div>
                <div className="bg-gradient-to-b from-plex/20 to-plex/5 border border-plex/30 rounded-xl p-4 flex flex-col items-center justify-center shadow-lg relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-16 h-16 bg-plex/20 blur-xl -mr-5 -mt-5 rounded-full"></div>
                    <span className="text-3xl font-black text-plex mb-1 drop-shadow-md">{analytics.uniqueTitles || 0}</span>
                    <span className="text-[9px] text-plex/80 uppercase tracking-widest font-black">Unique Titles</span>
                </div>
            </div>

            <p className="text-sm text-gray-300 italic bg-white/5 border border-white/10 rounded-lg px-4 py-3 w-full shadow-inner mb-4">
                {analytics.watchStyle === 'Comfort Binger' ? 'You love returning to your favorite comfort shows.' :
                    analytics.watchStyle === 'Loyal Fan' ? 'You stick around to finish what you start.' :
                        'You love exploring a wide variety of different content!'}
            </p>

            {analytics.topWatched && analytics.topWatched.filter((content: any) => content.plays > 1).length > 0 && (
                <div className="w-full mt-2">
                    <p className="text-left text-xs uppercase tracking-widest font-bold text-muted mb-3 border-b border-white/10 pb-2">Top Obsessions</p>
                    <div className="flex flex-col gap-2">
                        {analytics.topWatched.filter((content: any) => content.plays > 1).slice(0, 5).map((item: any, i: number) => (
                            <div key={i} className="flex items-center justify-between bg-white/5 border border-white/5 rounded-lg p-2 hover:bg-white/10 transition-colors">
                                <div className="flex items-center gap-3">
                                    <span className="text-gray-500 font-bold w-4 text-right">{i + 1}</span>
                                    {item.thumbUrl ? <img src={resolvePortalAssetUrl(item.thumbUrl)} className="w-8 h-12 object-cover rounded shadow-sm" /> : <div className="w-8 h-12 bg-white/10 rounded"></div>}
                                    <div className="flex flex-col text-left">
                                        <span className="font-bold text-sm text-gray-200 line-clamp-1">{item.title}</span>
                                        <span className="text-[10px] text-gray-400 font-bold tracking-widest uppercase">{item.type}</span>
                                    </div>
                                </div>
                                <span className="text-xs font-black text-plex whitespace-nowrap">{item.plays} plays</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
});

export const StreamingHabitSection = memo(function StreamingHabitSection({ analytics }: WrapUpAnalyticsSectionProps) {
    const avgWd = (analytics.weekdayPlays || 0) / 5;
    const avgWe = (analytics.weekendPlays || 0) / 2;

    return (
        <div className="flex flex-col items-center justify-center text-center p-6">
            <Coffee className="w-16 h-16 text-plex mb-4 drop-shadow-lg" />
            <h2 className="text-3xl font-black text-white mb-2">{analytics.streamingHabit || 'Unknown'}</h2>
            <p className="text-muted mb-8 uppercase tracking-widest text-xs font-bold">Weekday vs Weekend</p>

            <div className="w-full relative h-16 rounded-2xl overflow-hidden flex shadow-inner bg-black/50 border border-white/10">
                <div className="h-full bg-gradient-to-r from-blue-600 to-blue-400 flex items-center justify-center transition-all duration-1000 shadow-[inset_0_0_20px_rgba(0,0,0,0.3)] relative overflow-hidden group" style={{ width: `${((analytics.weekdayPlays || 0) / Math.max(analytics.totalPlays || 1, 1)) * 100}%` }}>
                    {analytics.weekdayPlays > 0 && <span className="text-white font-black drop-shadow-md z-10 text-sm">WD</span>}
                </div>
                <div className="h-full bg-gradient-to-r from-plex to-orange-400 flex items-center justify-center transition-all duration-1000 shadow-[inset_0_0_20px_rgba(0,0,0,0.3)] relative overflow-hidden group" style={{ width: `${((analytics.weekendPlays || 0) / Math.max(analytics.totalPlays || 1, 1)) * 100}%` }}>
                    {analytics.weekendPlays > 0 && <span className="text-white font-black drop-shadow-md z-10 text-sm">WE</span>}
                </div>
            </div>
            <div className="flex justify-between w-full mt-3 px-2">
                <div className="flex flex-col items-start">
                    <span className="text-[10px] uppercase tracking-widest font-bold text-blue-400">Weekdays (5 days)</span>
                    <span className="text-lg font-black text-white">{analytics.weekdayPlays || 0} <span className="text-[10px] text-gray-500 font-normal">({avgWd.toFixed(1)}/day)</span></span>
                </div>
                <div className="flex flex-col items-end">
                    <span className="text-[10px] uppercase tracking-widest font-bold text-plex">Weekends (2 days)</span>
                    <span className="text-lg font-black text-white">{analytics.weekendPlays || 0} <span className="text-[10px] text-gray-500 font-normal">({avgWe.toFixed(1)}/day)</span></span>
                </div>
            </div>
        </div>
    );
});
