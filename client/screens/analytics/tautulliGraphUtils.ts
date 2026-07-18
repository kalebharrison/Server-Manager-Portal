export const GRAPH_COLORS = [
    '#3b82f6', // blue
    '#10b981', // green
    '#f59e0b', // amber
    '#ef4444', // red
    '#8b5cf6', // purple
    '#ec4899', // pink
    '#06b6d4', // cyan
    '#14b8a6', // teal
    '#f97316', // orange
    '#a855f7'  // violet
];

export const STREAM_COLORS: Record<string, string> = {
    'Direct Play': '#eab308',
    'Direct Stream': '#e2e8f0',
    'Transcode': '#ef4444'
};

export const parseDateData = (data: any, yAxis: 'plays' | 'duration') => {
    if (!data || !data.categories || !data.series) return [];
    return data.categories.map((date: string, i: number) => {
        const obj: any = { date };
        data.series.forEach((s: any) => {
            let val = s.data[i] || 0;
            if (yAxis === 'duration') {
                val = parseFloat((val / 3600).toFixed(1));
            }
            obj[s.name] = val;
        });
        return obj;
    });
};

export const parseConcurrentData = (data: any) => {
    if (!data || !data.categories || !data.series) return [];
    return data.categories.map((date: string, i: number) => {
        const obj: any = { date };
        data.series.forEach((s: any) => {
            obj[s.name] = s.data[i] || 0;
        });
        return obj;
    });
};

export const getSeriesKeys = (data: any) => {
    if (!data || !data.series) return [];
    return data.series.map((s: any) => s.name);
};

export type TautulliGraphsData = {
    dailyData: any[];
    dayOfWeekData: any[];
    hourOfDayData: any[];
    streamTypeData: any[];
    streamTypeKeys: string[];
    concurrentData: any[];
    concurrentKeys: string[];
    resolutionData: any[];
    resolutionKeys: string[];
    platformData: any[];
    platformKeys: string[];
    sourceResolutionData: any[];
    sourceResolutionKeys: string[];
    topUsersData: any[];
    topUsersKeys: string[];
};

export const buildTautulliGraphsData = (graphs: any, yAxis: 'plays' | 'duration'): TautulliGraphsData => {
    const {
        get_plays_by_date,
        get_plays_by_dayofweek,
        get_plays_by_hourofday,
        get_plays_by_stream_type,
        get_plays_by_stream_resolution,
        get_plays_by_top_10_platforms,
        get_concurrent_streams_by_stream_type,
        get_plays_by_source_resolution,
        get_plays_by_top_10_users
    } = graphs;

    return {
        dailyData: parseDateData(get_plays_by_date, yAxis),
        dayOfWeekData: parseDateData(get_plays_by_dayofweek, yAxis),
        hourOfDayData: parseDateData(get_plays_by_hourofday, yAxis),
        streamTypeData: parseDateData(get_plays_by_stream_type, yAxis),
        streamTypeKeys: getSeriesKeys(get_plays_by_stream_type),
        concurrentData: parseConcurrentData(get_concurrent_streams_by_stream_type),
        concurrentKeys: getSeriesKeys(get_concurrent_streams_by_stream_type),
        resolutionData: parseDateData(get_plays_by_stream_resolution, yAxis),
        resolutionKeys: getSeriesKeys(get_plays_by_stream_resolution),
        platformData: parseDateData(get_plays_by_top_10_platforms, yAxis),
        platformKeys: getSeriesKeys(get_plays_by_top_10_platforms),
        sourceResolutionData: parseDateData(get_plays_by_source_resolution, yAxis),
        sourceResolutionKeys: getSeriesKeys(get_plays_by_source_resolution),
        topUsersData: parseDateData(get_plays_by_top_10_users, yAxis),
        topUsersKeys: getSeriesKeys(get_plays_by_top_10_users),
    };
};
