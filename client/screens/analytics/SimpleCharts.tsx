import React from 'react';

type ChartDatum = Record<string, any>;
type ChartSeries = { key: string; label?: string; color: string };

const WIDTH = 640;
const HEIGHT = 260;
const MARGIN = { top: 18, right: 18, bottom: 34, left: 34 };
const COLORS = ['#E5A00D', '#3B82F6', '#10B981', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#F97316'];

const toNumber = (value: any) => {
    const parsed = Number(value || 0);
    return Number.isFinite(parsed) ? parsed : 0;
};

const chartBounds = () => {
    const left = MARGIN.left;
    const top = MARGIN.top;
    const width = WIDTH - MARGIN.left - MARGIN.right;
    const height = HEIGHT - MARGIN.top - MARGIN.bottom;
    return { left, top, width, height, bottom: top + height, right: left + width };
};

const sampledTicks = (data: ChartDatum[], xKey: string) => {
    if (data.length <= 1) return data.map((row, index) => ({ index, label: String(row[xKey] || '') }));
    const maxTicks = 6;
    const step = Math.max(1, Math.ceil(data.length / maxTicks));
    return data
        .map((row, index) => ({ index, label: String(row[xKey] || '') }))
        .filter((tick) => tick.index === 0 || tick.index === data.length - 1 || tick.index % step === 0);
};

const trimLabel = (value: string, max = 14) => value.length > max ? `${value.slice(0, max - 1)}...` : value;

const Legend: React.FC<{ series: ChartSeries[] }> = ({ series }) => (
    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-[11px] font-bold text-muted">
        {series.map((item) => (
            <span key={item.key} className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                {item.label || item.key}
            </span>
        ))}
    </div>
);

const Grid: React.FC<{ max: number }> = ({ max }) => {
    const bounds = chartBounds();
    return (
        <>
            {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
                const y = bounds.bottom - ratio * bounds.height;
                return (
                    <g key={ratio}>
                        <line x1={bounds.left} x2={bounds.right} y1={y} y2={y} stroke="rgba(255,255,255,0.08)" />
                        <text x={bounds.left - 8} y={y + 4} textAnchor="end" fontSize="10" fill="rgba(255,255,255,0.42)">
                            {Math.round(max * ratio)}
                        </text>
                    </g>
                );
            })}
        </>
    );
};

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

export const SimpleDonutChart: React.FC<{
    data: ChartDatum[];
    labelKey: string;
    valueKey: string;
    colors?: string[];
}> = ({ data, labelKey, valueKey, colors = COLORS }) => {
    const total = data.reduce((sum, row) => sum + toNumber(row[valueKey]), 0);
    if (total <= 0) return <p className="text-muted text-sm">No data.</p>;

    let cumulative = 0;
    const radius = 78;
    const circumference = 2 * Math.PI * radius;

    return (
        <div className="h-full w-full grid grid-cols-1 sm:grid-cols-[220px_minmax(0,1fr)] items-center gap-4">
            <svg viewBox="0 0 220 220" className="h-full min-h-[210px] w-full" role="img">
                <circle cx="110" cy="110" r={radius} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="30" />
                {data.map((row, index) => {
                    const value = toNumber(row[valueKey]);
                    const length = (value / total) * circumference;
                    const dashOffset = -cumulative;
                    cumulative += length;
                    return (
                        <circle
                            key={`${row[labelKey] || index}`}
                            cx="110"
                            cy="110"
                            r={radius}
                            fill="none"
                            stroke={colors[index % colors.length]}
                            strokeWidth="30"
                            strokeDasharray={`${length} ${circumference - length}`}
                            strokeDashoffset={dashOffset}
                            transform="rotate(-90 110 110)"
                        >
                            <title>{`${row[labelKey] || 'Unknown'}: ${value}`}</title>
                        </circle>
                    );
                })}
                <text x="110" y="106" textAnchor="middle" fontSize="24" fontWeight="800" fill="white">{total}</text>
                <text x="110" y="128" textAnchor="middle" fontSize="11" fill="rgba(255,255,255,0.55)">plays</text>
            </svg>
            <div className="flex flex-col gap-2 text-xs min-w-0">
                {data.slice(0, 8).map((row, index) => (
                    <div key={`${row[labelKey] || index}`} className="flex items-center justify-between gap-3">
                        <span className="inline-flex items-center gap-2 min-w-0 text-muted">
                            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: colors[index % colors.length] }} />
                            <span className="truncate">{row[labelKey] || 'Unknown'}</span>
                        </span>
                        <span className="font-mono text-text">{toNumber(row[valueKey])}</span>
                    </div>
                ))}
            </div>
        </div>
    );
};

export const defaultChartColors = COLORS;
