import { memo } from 'react';
import { Calendar, Clock, Layers } from 'lucide-react';

import { formatStreamingHour } from '../../../shared/format';
import type { WrapUpAnalyticsSectionProps } from './types';

export const TimeOfDaySection = memo(function TimeOfDaySection({ analytics }: WrapUpAnalyticsSectionProps) {
    const maxHour = Math.max(...(analytics.hourDistribution || [0]));

    return (
        <div className="flex flex-col items-center justify-center text-center p-6">
            <Clock className="w-16 h-16 text-plex mb-4 drop-shadow-lg" />
            <h2 className="text-3xl font-black text-white mb-2">{analytics.timeOfDay || 'Unknown'}</h2>
            <p className="text-muted mb-6">You typically stream around {formatStreamingHour(analytics.peakHour ?? analytics.avgHour)}.</p>

            <div className="w-full mt-2 mb-6">
                <p className="text-left text-xs uppercase tracking-widest font-bold text-muted mb-3 border-b border-white/10 pb-2">24-Hour Heat Map</p>
                <div className="w-full flex items-end justify-between h-24 gap-[2px] mt-4 px-1">
                    {analytics.hourDistribution?.map((count: number, hour: number) => {
                        const height = maxHour > 0 ? (count / maxHour) * 100 : 0;
                        const isTop = count === maxHour && count > 0;
                        return (
                            <div key={hour} className="flex flex-col items-center justify-end w-full h-full group relative">
                                <div className={`w-full rounded-t-sm transition-all duration-500 relative flex items-end justify-center overflow-hidden
                                    ${isTop ? 'bg-plex shadow-[0_0_10px_rgba(229,160,13,0.5)]' : 'bg-white/10 group-hover:bg-white/30'}`}
                                    style={{ height: `${Math.max(height, 2)}%` }}>
                                </div>
                                {hour % 6 === 0 && <span className="text-[8px] mt-1 font-bold text-muted absolute top-full pointer-events-none">{hour}h</span>}
                                <div className="absolute bottom-full mb-1 opacity-0 group-hover:opacity-100 bg-black/80 text-white text-[10px] px-1.5 py-0.5 rounded pointer-events-none whitespace-nowrap z-10 transition-opacity">
                                    {count} plays at {formatStreamingHour(hour)}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            <div className="w-full bg-gradient-to-r from-plex/5 via-plex/10 to-plex/5 border border-plex/20 rounded-xl p-4 shadow-inner mt-4">
                <p className="text-sm text-plex font-medium">
                    {analytics.timeOfDay === 'Early Bird' ? 'Catching the worm with those morning streams!' :
                        analytics.timeOfDay === 'Afternoon Watcher' ? 'Perfect way to spend the afternoon.' :
                            analytics.timeOfDay === 'Evening Streamer' ? 'Unwinding after a long day.' :
                                'Burning the midnight oil with some late night streaming!'}
                </p>
            </div>
        </div>
    );
});

export const TopDaySection = memo(function TopDaySection({ analytics }: WrapUpAnalyticsSectionProps) {
    const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const maxCount = Math.max(...(analytics.dayOfWeekCounts ? Object.values(analytics.dayOfWeekCounts) as number[] : [0]));

    return (
        <div className="flex flex-col items-center justify-center text-center p-6">
            <Calendar className="w-16 h-16 text-plex mb-4 drop-shadow-lg" />
            <h2 className="text-3xl font-black text-white mb-2">{analytics.popularDay || 'Unknown'}</h2>
            <p className="text-muted mb-6 uppercase tracking-widest text-xs font-bold">Most Active Day</p>
            <div className="w-full flex items-end justify-between h-32 gap-1.5 mt-4 px-2">
                {daysOfWeek.map((day, i) => {
                    const count = analytics.dayOfWeekCounts ? analytics.dayOfWeekCounts[i] : 0;
                    const height = maxCount > 0 ? (count / maxCount) * 100 : 0;
                    const isTop = count === maxCount && count > 0;
                    return (
                        <div key={day} className="flex flex-col items-center justify-end w-full h-full group relative">
                            <div className={`w-full rounded-t-md transition-all duration-500 relative flex items-end justify-center pb-1 overflow-hidden
                                ${isTop ? 'bg-gradient-to-t from-plex/80 to-plex shadow-[0_0_15px_rgba(229,160,13,0.3)]' : 'bg-gradient-to-t from-white/10 to-white/20 group-hover:from-white/20 group-hover:to-white/30'}`}
                                style={{ height: `${Math.max(height, 8)}%` }}>
                            </div>
                            <span className={`text-[9px] mt-2 font-black uppercase tracking-wider ${isTop ? 'text-plex' : 'text-muted'}`}>{day}</span>
                            <div className="absolute bottom-full mb-1 opacity-0 group-hover:opacity-100 bg-black/80 text-white text-[10px] px-1.5 py-0.5 rounded pointer-events-none whitespace-nowrap z-10 transition-opacity">
                                {count} plays
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
});

export const TopLibrarySection = memo(function TopLibrarySection({ analytics }: WrapUpAnalyticsSectionProps) {
    const maxLibPlays = analytics.allLibraries?.[0]?.plays || 1;

    return (
        <div className="flex flex-col items-center justify-center text-center p-6 max-h-[80vh] overflow-hidden flex-1">
            <Layers className="w-16 h-16 text-plex mb-4 drop-shadow-lg shrink-0" />
            <h2 className="text-3xl font-black text-white mb-2 line-clamp-1 shrink-0">{analytics.favoriteLibrary || 'None'}</h2>
            <p className="text-muted mb-6 uppercase tracking-widest text-xs font-bold shrink-0">Library Breakdown</p>

            <div className="w-full flex flex-col gap-3 overflow-y-auto pr-2 pb-2 custom-scrollbar">
                {analytics.allLibraries?.map((lib: any, i: number) => {
                    const percent = (lib.plays / maxLibPlays) * 100;
                    return (
                        <div key={i} className="flex flex-col gap-1 w-full text-left">
                            <div className="flex justify-between items-end">
                                <span className={`font-bold text-sm truncate pr-2 ${i === 0 ? 'text-plex' : 'text-gray-300'}`}>{i + 1}. {lib.title}</span>
                                <span className={`font-black text-xs whitespace-nowrap ${i === 0 ? 'text-plex' : 'text-gray-400'}`}>{lib.plays} plays</span>
                            </div>
                            <div className="w-full bg-black/40 rounded-full h-1.5 overflow-hidden border border-white/5">
                                <div className={`h-full rounded-full transition-all duration-1000 ${i === 0 ? 'bg-plex shadow-[0_0_8px_rgba(229,160,13,0.8)]' : 'bg-gray-400'}`} style={{ width: `${percent}%` }}></div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
});
