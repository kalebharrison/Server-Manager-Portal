import React from 'react';

import {
    ChartDatum,
    ChartSeries,
    Grid,
    HEIGHT,
    Legend,
    WIDTH,
    chartBounds,
    sampledTicks,
    toNumber,
    trimLabel,
} from './simpleChartUtils';

export const SimpleLineChart: React.FC<{
    data: ChartDatum[];
    xKey: string;
    series: ChartSeries[];
    fillFirst?: boolean;
}> = ({ data, xKey, series, fillFirst = false }) => {
    const bounds = chartBounds();
    const max = Math.max(1, ...data.flatMap((row) => series.map((item) => toNumber(row[item.key]))));
    const xFor = (index: number) => bounds.left + (data.length <= 1 ? bounds.width / 2 : (index / (data.length - 1)) * bounds.width);
    const yFor = (value: number) => bounds.bottom - (value / max) * bounds.height;

    return (
        <div className="h-full w-full">
            <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="h-full w-full overflow-visible" role="img">
                <Grid max={max} />
                {sampledTicks(data, xKey).map((tick) => (
                    <text key={`${tick.index}-${tick.label}`} x={xFor(tick.index)} y={HEIGHT - 10} textAnchor="middle" fontSize="10" fill="rgba(255,255,255,0.42)">
                        {trimLabel(tick.label, 10)}
                    </text>
                ))}
                {series.map((item, seriesIndex) => {
                    const points = data.map((row, index) => `${xFor(index)},${yFor(toNumber(row[item.key]))}`).join(' ');
                    const areaPoints = `${bounds.left},${bounds.bottom} ${points} ${bounds.right},${bounds.bottom}`;
                    return (
                        <g key={item.key}>
                            {fillFirst && seriesIndex === 0 && (
                                <polygon points={areaPoints} fill={item.color} opacity="0.18" />
                            )}
                            <polyline points={points} fill="none" stroke={item.color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                            {data.map((row, index) => (
                                <circle key={`${item.key}-${index}`} cx={xFor(index)} cy={yFor(toNumber(row[item.key]))} r="6" fill="transparent">
                                    <title>{`${item.label || item.key}: ${toNumber(row[item.key])} (${row[xKey] || ''})`}</title>
                                </circle>
                            ))}
                        </g>
                    );
                })}
            </svg>
            {series.length > 1 && <Legend series={series} />}
        </div>
    );
};

export const SimpleStackedBarChart: React.FC<{
    data: ChartDatum[];
    xKey: string;
    series: ChartSeries[];
}> = ({ data, xKey, series }) => {
    const bounds = chartBounds();
    const max = Math.max(1, ...data.map((row) => series.reduce((sum, item) => sum + toNumber(row[item.key]), 0)));
    const groupWidth = bounds.width / Math.max(1, data.length);
    const barWidth = Math.max(2, Math.min(28, groupWidth * 0.72));

    return (
        <div className="h-full w-full">
            <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="h-full w-full overflow-visible" role="img">
                <Grid max={max} />
                {sampledTicks(data, xKey).map((tick) => (
                    <text key={`${tick.index}-${tick.label}`} x={bounds.left + tick.index * groupWidth + groupWidth / 2} y={HEIGHT - 10} textAnchor="middle" fontSize="10" fill="rgba(255,255,255,0.42)">
                        {trimLabel(tick.label, 10)}
                    </text>
                ))}
                {data.map((row, index) => {
                    let offset = 0;
                    const x = bounds.left + index * groupWidth + (groupWidth - barWidth) / 2;
                    return (
                        <g key={`${row[xKey] || index}`}>
                            {series.map((item) => {
                                const value = toNumber(row[item.key]);
                                const height = (value / max) * bounds.height;
                                const y = bounds.bottom - offset - height;
                                offset += height;
                                return (
                                    <rect key={item.key} x={x} y={y} width={barWidth} height={Math.max(0, height)} fill={item.color} rx="2">
                                        <title>{`${item.label || item.key}: ${value} (${row[xKey] || ''})`}</title>
                                    </rect>
                                );
                            })}
                        </g>
                    );
                })}
            </svg>
            <Legend series={series} />
        </div>
    );
};

export const SimpleVerticalBarChart: React.FC<{
    data: ChartDatum[];
    labelKey: string;
    valueKey: string;
    color?: string;
}> = ({ data, labelKey, valueKey, color = '#E5A00D' }) => {
    const max = Math.max(1, ...data.map((row) => toNumber(row[valueKey])));
    return (
        <div className="h-full w-full flex flex-col justify-center gap-3">
            {data.map((row, index) => {
                const value = toNumber(row[valueKey]);
                return (
                    <div key={`${row[labelKey] || index}`} className="grid grid-cols-[6rem_minmax(0,1fr)_3rem] items-center gap-3 text-xs">
                        <span className="text-muted truncate" title={String(row[labelKey] || '')}>{row[labelKey] || 'Unknown'}</span>
                        <div className="h-3 rounded-full bg-white/10 overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${(value / max) * 100}%`, backgroundColor: color }} />
                        </div>
                        <span className="font-mono text-plex text-right">{value}</span>
                    </div>
                );
            })}
        </div>
    );
};
