import { memo } from 'react';
import { Activity, BarChart3, LineChart as LucideLineChart } from 'lucide-react';

import { CustomSelect } from '../../shared/ui';

export type AnalyticsViewTab = 'overview' | 'graphs';

const PERIOD_OPTIONS = [
    { label: 'Last 24 Hours', value: '1' },
    { label: 'Last 7 Days', value: '7' },
    { label: 'Last 30 Days', value: '30' },
    { label: 'Last 60 Days', value: '60' },
    { label: 'Last 1 Year', value: '365' },
    { label: 'Last 5 Years', value: '1825' },
    { label: 'All Time', value: 'all' },
];

export const AnalyticsDashboardHeader = memo(({
    days,
    isJellyfinPortal,
    viewTab,
    onDaysChange,
    onTabChange,
}: {
    days: string;
    isJellyfinPortal: boolean;
    viewTab: AnalyticsViewTab;
    onDaysChange: (days: string) => void;
    onTabChange: (tab: AnalyticsViewTab) => void;
}) => (
    <div className="flex flex-col gap-4 mb-6">
        <h1 className="text-3xl font-black text-white flex items-center gap-3 uppercase tracking-wider">
            <BarChart3 className="w-8 h-8 text-plex" />
            Advanced Analytics
        </h1>
        <div className="flex flex-row items-center justify-between gap-3 w-full">
            <div className="flex bg-black/40 rounded-lg p-1 border border-white/5 w-fit overflow-x-auto hide-scrollbar">
                <button onClick={() => onTabChange('overview')} className={`px-3 md:px-4 py-2 rounded-md text-xs md:text-sm font-bold uppercase tracking-wider transition-colors flex items-center gap-1.5 md:gap-2 ${viewTab === 'overview' ? 'bg-plex text-white shadow-lg' : 'text-muted hover:text-white'}`}>
                    <Activity className="w-4 h-4 shrink-0" /> <span className="hidden sm:inline">Overview</span><span className="sm:hidden">Overview</span>
                </button>
                {!isJellyfinPortal && (
                    <button onClick={() => onTabChange('graphs')} className={`px-3 md:px-4 py-2 rounded-md text-xs md:text-sm font-bold uppercase tracking-wider transition-colors flex items-center gap-1.5 md:gap-2 ${viewTab === 'graphs' ? 'bg-plex text-white shadow-lg' : 'text-muted hover:text-white'}`}>
                        <LucideLineChart className="w-4 h-4 shrink-0" /> <span className="hidden sm:inline">Graphs</span><span className="sm:hidden">Graphs</span>
                    </button>
                )}
            </div>
            {viewTab === 'overview' && (
                <div className="w-[140px] md:w-48 shrink-0">
                    <CustomSelect
                        value={days}
                        onChange={(value) => onDaysChange(value as string)}
                        compact={true}
                        options={PERIOD_OPTIONS}
                    />
                </div>
            )}
        </div>
    </div>
));

AnalyticsDashboardHeader.displayName = 'AnalyticsDashboardHeader';
