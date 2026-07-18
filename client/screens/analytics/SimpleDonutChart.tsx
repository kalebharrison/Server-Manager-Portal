import React from 'react';

import { ChartDatum, COLORS, toNumber } from './simpleChartUtils';

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
