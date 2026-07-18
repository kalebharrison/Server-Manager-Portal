import React from 'react';
import { Activity, Calendar, Clock, Layers, LineChart as LucideLineChart, MonitorSmartphone, TrendingUp, Trophy, Users } from 'lucide-react';

import { CustomSelect } from '../../shared/ui';
import { SimpleLineChart, SimpleStackedBarChart } from './SimpleCharts';
import { GRAPH_COLORS, STREAM_COLORS } from './tautulliGraphUtils';
import type { TautulliGraphsState } from './useTautulliGraphs';

export const TautulliGraphsContent: React.FC<TautulliGraphsState> = ({
    days,
    setDays,
    yAxis,
    setYAxis,
    chartData,
}) => {
    if (!chartData) return null;

    const {
        dailyData,
        dayOfWeekData,
        hourOfDayData,
        streamTypeData,
        streamTypeKeys,
        concurrentData,
        concurrentKeys,
        resolutionData,
        resolutionKeys,
        platformData,
        platformKeys,
        sourceResolutionData,
        sourceResolutionKeys,
        topUsersData,
        topUsersKeys,
    } = chartData;

    return (
        <div className="space-y-6 mt-6 min-w-0">
            <div className="flex flex-col sm:flex-row justify-between items-end sm:items-center gap-4">
                <div className="flex bg-black/40 rounded-lg p-1 border border-white/5 w-fit">
                    <button onClick={() => setYAxis('plays')} className={`px-4 py-1.5 rounded-md text-xs font-bold uppercase tracking-wider transition-colors ${yAxis === 'plays' ? 'bg-plex text-white shadow-lg' : 'text-muted hover:text-white'}`}>
                        Play Count
                    </button>
                    <button onClick={() => setYAxis('duration')} className={`px-4 py-1.5 rounded-md text-xs font-bold uppercase tracking-wider transition-colors ${yAxis === 'duration' ? 'bg-plex text-white shadow-lg' : 'text-muted hover:text-white'}`}>
                        Watch Duration
                    </button>
                </div>
                <div className="w-48">
                    <CustomSelect
                        value={days}
                        onChange={setDays}
                        options={[
                            { label: 'Last 7 Days', value: '7' },
                            { label: 'Last 30 Days', value: '30' },
                            { label: 'Last 90 Days', value: '90' },
                            { label: 'Last 365 Days', value: '365' },
                            { label: 'All Time', value: '0' }
                        ]}
                    />
                </div>
            </div>

            <div className="glass-card-sm p-4 md:p-6 relative overflow-hidden">
                <h3 className="text-lg font-bold text-text mb-4 uppercase tracking-wider flex items-center gap-2">
                    <LucideLineChart className="w-5 h-5 text-[#3b82f6]" /> {yAxis === 'plays' ? 'Daily Play Count by Media Type' : 'Daily Watch Duration by Media Type (Hours)'}
                </h3>
                <div className="h-72 w-full">
                    <SimpleLineChart
                        data={dailyData}
                        xKey="date"
                        series={[
                            { key: 'TV', color: '#eab308' },
                            { key: 'Movies', color: '#3b82f6' },
                            { key: 'Music', color: '#ef4444' },
                            { key: 'Total', color: '#8b5cf6' },
                        ]}
                    />
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="glass-card-sm p-4 md:p-6 relative overflow-hidden">
                    <h3 className="text-lg font-bold text-text mb-4 uppercase tracking-wider flex items-center gap-2">
                        <Calendar className="w-5 h-5 text-green-400" /> {yAxis === 'plays' ? 'Play Count by Day of Week' : 'Watch Duration by Day of Week (Hours)'}
                    </h3>
                    <div className="h-64 w-full">
                        <SimpleStackedBarChart
                            data={dayOfWeekData}
                            xKey="date"
                            series={[
                                { key: 'TV', color: '#eab308' },
                                { key: 'Movies', color: '#3b82f6' },
                                { key: 'Music', color: '#ef4444' },
                            ]}
                        />
                    </div>
                </div>

                <div className="glass-card-sm p-4 md:p-6 relative overflow-hidden">
                    <h3 className="text-lg font-bold text-text mb-4 uppercase tracking-wider flex items-center gap-2">
                        <Clock className="w-5 h-5 text-orange-400" /> {yAxis === 'plays' ? 'Play Count by Hour of Day' : 'Watch Duration by Hour of Day (Hours)'}
                    </h3>
                    <div className="h-64 w-full">
                        <SimpleStackedBarChart
                            data={hourOfDayData}
                            xKey="date"
                            series={[
                                { key: 'TV', color: '#eab308' },
                                { key: 'Movies', color: '#3b82f6' },
                                { key: 'Music', color: '#ef4444' },
                            ]}
                        />
                    </div>
                </div>

                <div className="glass-card-sm p-4 md:p-6 relative overflow-hidden">
                    <h3 className="text-lg font-bold text-text mb-4 uppercase tracking-wider flex items-center gap-2">
                        <Activity className="w-5 h-5 text-sky-400" /> {yAxis === 'plays' ? 'Daily Stream Type Breakdown' : 'Daily Stream Type Duration Breakdown (Hours)'}
                    </h3>
                    <div className="h-64 w-full">
                        <SimpleLineChart
                            data={streamTypeData}
                            xKey="date"
                            series={streamTypeKeys.map((key: string, idx: number) => ({ key, color: STREAM_COLORS[key] || GRAPH_COLORS[idx % GRAPH_COLORS.length] }))}
                        />
                    </div>
                </div>

                <div className="glass-card-sm p-4 md:p-6 relative overflow-hidden">
                    <h3 className="text-lg font-bold text-text mb-4 uppercase tracking-wider flex items-center gap-2">
                        <TrendingUp className="w-5 h-5 text-plex" /> Daily Concurrent Stream Count by Stream Type
                    </h3>
                    <div className="h-64 w-full">
                        <SimpleLineChart
                            data={concurrentData}
                            xKey="date"
                            series={concurrentKeys.map((key: string, idx: number) => ({ key, color: STREAM_COLORS[key] || GRAPH_COLORS[idx % GRAPH_COLORS.length] }))}
                        />
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="glass-card-sm p-4 md:p-6 relative overflow-hidden">
                    <h3 className="text-lg font-bold text-text mb-4 uppercase tracking-wider flex items-center gap-2">
                        <MonitorSmartphone className="w-5 h-5 text-purple-400" /> {yAxis === 'plays' ? 'Stream Resolution Breakdown' : 'Stream Resolution Duration Breakdown (Hours)'}
                    </h3>
                    <div className="h-64 w-full">
                        <SimpleStackedBarChart
                            data={resolutionData}
                            xKey="date"
                            series={resolutionKeys.map((key: string, idx: number) => ({ key, color: GRAPH_COLORS[idx % GRAPH_COLORS.length] }))}
                        />
                    </div>
                </div>

                <div className="glass-card-sm p-4 md:p-6 relative overflow-hidden flex flex-col justify-between">
                    <div>
                        <h3 className="text-lg font-bold text-text mb-4 uppercase tracking-wider flex items-center gap-2">
                            <Users className="w-5 h-5 text-teal-400" /> {yAxis === 'plays' ? 'Top 10 Streaming Platforms' : 'Top 10 Platforms by Watch Duration (Hours)'}
                        </h3>
                        <div className="h-64 w-full">
                            <SimpleStackedBarChart
                                data={platformData}
                                xKey="date"
                                series={platformKeys.map((key: string, idx: number) => ({ key, color: GRAPH_COLORS[idx % GRAPH_COLORS.length] }))}
                            />
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="glass-card-sm p-4 md:p-6 relative overflow-hidden">
                    <h3 className="text-lg font-bold text-text mb-4 uppercase tracking-wider flex items-center gap-2">
                        <Layers className="w-5 h-5 text-indigo-400" /> {yAxis === 'plays' ? 'Source File Resolution Breakdown' : 'Source File Resolution Duration Breakdown (Hours)'}
                    </h3>
                    <div className="h-64 w-full">
                        <SimpleStackedBarChart
                            data={sourceResolutionData}
                            xKey="date"
                            series={sourceResolutionKeys.map((key: string, idx: number) => ({ key, color: GRAPH_COLORS[idx % GRAPH_COLORS.length] }))}
                        />
                    </div>
                </div>

                <div className="glass-card-sm p-4 md:p-6 relative overflow-hidden flex flex-col justify-between">
                    <div>
                        <h3 className="text-lg font-bold text-text mb-4 uppercase tracking-wider flex items-center gap-2">
                            <Trophy className="w-5 h-5 text-amber-400" /> {yAxis === 'plays' ? 'Top 10 Active Users Breakdown' : 'Top 10 Users by Watch Duration (Hours)'}
                        </h3>
                        <div className="h-64 w-full">
                            <SimpleStackedBarChart
                                data={topUsersData}
                                xKey="date"
                                series={topUsersKeys.map((key: string, idx: number) => ({ key, color: GRAPH_COLORS[idx % GRAPH_COLORS.length] }))}
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
