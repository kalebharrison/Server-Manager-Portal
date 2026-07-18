import React from 'react';

export type ChartDatum = Record<string, any>;
export type ChartSeries = { key: string; label?: string; color: string };

export const WIDTH = 640;
export const HEIGHT = 260;
export const MARGIN = { top: 18, right: 18, bottom: 34, left: 34 };
export const COLORS = ['#E5A00D', '#3B82F6', '#10B981', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#F97316'];

export const toNumber = (value: any) => {
    const parsed = Number(value || 0);
    return Number.isFinite(parsed) ? parsed : 0;
};

export const chartBounds = () => {
    const left = MARGIN.left;
    const top = MARGIN.top;
    const width = WIDTH - MARGIN.left - MARGIN.right;
    const height = HEIGHT - MARGIN.top - MARGIN.bottom;
    return { left, top, width, height, bottom: top + height, right: left + width };
};

export const sampledTicks = (data: ChartDatum[], xKey: string) => {
    if (data.length <= 1) return data.map((row, index) => ({ index, label: String(row[xKey] || '') }));
    const maxTicks = 6;
    const step = Math.max(1, Math.ceil(data.length / maxTicks));
    return data
        .map((row, index) => ({ index, label: String(row[xKey] || '') }))
        .filter((tick) => tick.index === 0 || tick.index === data.length - 1 || tick.index % step === 0);
};

export const trimLabel = (value: string, max = 14) => value.length > max ? `${value.slice(0, max - 1)}...` : value;

export const Legend: React.FC<{ series: ChartSeries[] }> = ({ series }) => (
    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-[11px] font-bold text-muted">
        {series.map((item) => (
            <span key={item.key} className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                {item.label || item.key}
            </span>
        ))}
    </div>
);

export const Grid: React.FC<{ max: number }> = ({ max }) => {
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
