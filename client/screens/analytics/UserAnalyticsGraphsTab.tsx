import React from 'react';

import { SimpleDonutChart, SimpleLineChart, SimpleStackedBarChart, SimpleVerticalBarChart, defaultChartColors } from './SimpleCharts';
import { daysOfWeek, formatHour } from './userAnalyticsUtils';

type UserAnalyticsGraphsTabProps = {
    data: any;
};

export const UserAnalyticsGraphsTab: React.FC<UserAnalyticsGraphsTabProps> = ({ data }) => (
    <div className="flex flex-col gap-6 h-full min-h-[400px]">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="glass-card-sm p-4 bg-black/20">
                <h3 className="text-sm font-bold text-text mb-4 uppercase tracking-wider">Plays by Hour of Day</h3>
                <div className="h-64">
                    {data.hourDistribution ? (
                        <SimpleLineChart
                            data={data.hourDistribution.map((plays: number, i: number) => ({ hour: formatHour(i), plays }))}
                            xKey="hour"
                            series={[{ key: 'plays', label: 'Plays', color: '#E5A00D' }]}
                            fillFirst
                        />
                    ) : <p className="text-muted text-sm">No data.</p>}
                </div>
            </div>

            <div className="glass-card-sm p-4 bg-black/20">
                <h3 className="text-sm font-bold text-text mb-4 uppercase tracking-wider">Plays by Day of Week</h3>
                <div className="h-64">
                    {data.dayOfWeekCounts ? (
                        <SimpleStackedBarChart
                            data={Object.values(data.dayOfWeekCounts).map((plays: any, i: number) => ({ day: daysOfWeek[i].substring(0, 3), plays }))}
                            xKey="day"
                            series={[{ key: 'plays', label: 'Plays', color: '#E5A00D' }]}
                        />
                    ) : <p className="text-muted text-sm">No data.</p>}
                </div>
            </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
            <div className="glass-card-sm p-4 bg-black/20">
                <h3 className="text-sm font-bold text-text mb-4 uppercase tracking-wider">Plays by Library</h3>
                <div className="h-64">
                    {data.topLibraries && data.topLibraries.length > 0 ? (
                        <SimpleDonutChart data={data.topLibraries} labelKey="title" valueKey="plays" colors={defaultChartColors} />
                    ) : <p className="text-muted text-sm">No data.</p>}
                </div>
            </div>

            <div className="glass-card-sm p-4 bg-black/20">
                <h3 className="text-sm font-bold text-text mb-4 uppercase tracking-wider">Top Watched Shows</h3>
                <div className="h-64">
                    {data.topShows && data.topShows.length > 0 ? (
                        <SimpleVerticalBarChart data={data.topShows.slice(0, 5)} labelKey="title" valueKey="plays" color="#3B82F6" />
                    ) : <p className="text-muted text-sm">No data.</p>}
                </div>
            </div>
        </div>
    </div>
);
