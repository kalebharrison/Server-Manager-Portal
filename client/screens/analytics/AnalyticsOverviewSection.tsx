import { memo } from 'react';
import { Clock, PlaySquare, Users } from 'lucide-react';

import { CountUp } from './CountUp';
import type { AnalyticsData } from './useAnalyticsData';

type AnalyticsCompare = NonNullable<AnalyticsData['compare']>;
type AnalyticsDelta = AnalyticsCompare['totalPlaybacks'];

const formatPriorPeriodLabel = (days: string) => {
    if (days === '1') return '24 hours';
    if (days === '7') return '7 days';
    if (days === '365') return 'year';
    if (days === '1825') return '5 years';
    return `${days} days`;
};

const DeltaBadge = ({
    compare,
    delta,
}: {
    compare: AnalyticsData['compare'];
    delta?: AnalyticsDelta | null;
}) => {
    if (!delta || (delta.absolute === 0 && delta.previous === 0)) return null;

    const isUp = delta.absolute >= 0;
    const sign = isUp ? '+' : '';
    const text = delta.percent !== null
        ? `${sign}${delta.percent}%`
        : (delta.previous ?? 0) === 0 && delta.absolute > 0
            ? 'New'
            : `${sign}${delta.absolute}`;
    const priorLabel = compare?.previousPeriodDays
        ? formatPriorPeriodLabel(compare.previousPeriodDays)
        : null;
    const tooltip = priorLabel
        ? `Compared to the previous ${priorLabel}${delta.previous != null ? ` (${delta.previous})` : ''}`
        : undefined;

    return (
        <span
            title={tooltip}
            className={`inline-flex items-center px-2 py-1 rounded-md text-[10px] font-bold mt-1 ${isUp ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'}`}
        >
            {text}
        </span>
    );
};

export const AnalyticsOverviewSection = memo(({
    compare,
    peakHours,
    topUsers,
    totalPlaybacks,
}: {
    compare: AnalyticsData['compare'];
    peakHours: number[];
    topUsers: AnalyticsData['topUsers'];
    totalPlaybacks: number;
}) => {
    const uniqueActiveViewers = topUsers.filter((user) => (user.plays || 0) > 0).length;
    const maxPeakHour = Math.max(...peakHours, 1);

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="glass-card-sm p-6 flex items-center gap-4">
                <div className="bg-plex/10 p-4 rounded-full">
                    <PlaySquare className="text-plex w-8 h-8" />
                </div>
                <div>
                    <p className="text-muted text-sm uppercase tracking-wider font-bold mb-1">Total Playbacks</p>
                    <p className="text-2xl font-black text-text"><CountUp end={totalPlaybacks} /></p>
                    <DeltaBadge compare={compare} delta={compare?.totalPlaybacks} />
                </div>
            </div>
            <div className="glass-card-sm p-6 flex items-center gap-4">
                <div className="bg-plex/10 p-4 rounded-full">
                    <Users className="text-plex w-8 h-8" />
                </div>
                <div>
                    <p className="text-muted text-sm uppercase tracking-wider font-bold mb-1">Unique Viewers</p>
                    <p className="text-lg font-bold text-text truncate max-w-[150px]" title={String(uniqueActiveViewers)}>{uniqueActiveViewers}</p>
                    <DeltaBadge compare={compare} delta={compare?.uniqueViewers} />
                </div>
            </div>
            <div className="glass-card-sm p-6 flex items-center gap-4 col-span-1 sm:col-span-2">
                <div className="w-full h-full flex flex-col justify-center">
                    <p className="text-muted text-sm uppercase tracking-wider font-bold mb-2 flex items-center gap-2"><Clock className="w-4 h-4 text-plex" /> Peak Viewing Hours</p>
                    <div className="flex items-end gap-1 h-12 w-full mt-auto">
                        {peakHours.map((value, index) => (
                            <div key={index} className="flex-1 bg-plex opacity-20 hover:opacity-80 transition-opacity rounded-t-sm relative group" style={{ height: `${Math.max((value / maxPeakHour) * 100, 5)}%` }}>
                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 bg-black/80 text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-10">
                                    {index === 0 ? '12 AM' : index < 12 ? `${index} AM` : index === 12 ? '12 PM' : `${index - 12} PM`}: {value} plays
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="flex justify-between text-[10px] text-muted mt-1 font-mono">
                        <span>12am</span><span>6am</span><span>12pm</span><span>6pm</span><span>11pm</span>
                    </div>
                </div>
            </div>
        </div>
    );
});

AnalyticsOverviewSection.displayName = 'AnalyticsOverviewSection';
