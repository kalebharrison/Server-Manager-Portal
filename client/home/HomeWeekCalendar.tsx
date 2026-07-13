import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Film, Tv } from 'lucide-react';

import { apiFetch } from '../shared/api';
import { cacheRefreshMs } from '../shared/cacheRefresh';
import { useVisibleInterval } from '../shared/useVisibleInterval';
import { mapRadarrCalendarItems, mapSonarrCalendarItems, summarizeSeasonReleaseBatches } from '../screens/media-stack/mediaStackUtils';

const cacheKey = (scope: string, offset: number) => `homeWeekCalendar:${scope}:${offset}`;
const readCachedWeek = (scope: string, offset: number) => {
    try {
        return JSON.parse(sessionStorage.getItem(cacheKey(scope, offset)) || 'null');
    } catch {
        return null;
    }
};
const ymd = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export const HomeWeekCalendar: React.FC<{ cacheMinutes?: number; cacheScope?: string }> = ({ cacheMinutes, cacheScope = 'server' }) => {
    const refreshMs = cacheRefreshMs({ cacheRefreshMinutes: cacheMinutes });
    const [weekOffset, setWeekOffset] = useState(0);
    const [data, setData] = useState<any>(() => readCachedWeek(cacheScope, 0));
    const selectWeek = (nextOffset: number) => {
        const next = Math.max(-4, Math.min(12, nextOffset));
        setWeekOffset(next);
        setData(readCachedWeek(cacheScope, next));
    };

    const loadWeek = useCallback(async () => {
        const cached = readCachedWeek(cacheScope, weekOffset);
        if (cached) setData(cached);
        try {
            const next = await apiFetch(`/api/media-stack/calendar?weekOffset=${weekOffset}`, {
                cacheTtlMs: refreshMs,
                staleIfErrorMs: 30 * 60_000,
            });
            setData(next);
            sessionStorage.setItem(cacheKey(cacheScope, weekOffset), JSON.stringify(next));
        } catch {
            // Keep the most recent week visible if an integration is temporarily unavailable.
        }
    }, [cacheScope, refreshMs, weekOffset]);

    useEffect(() => { void loadWeek(); }, [loadWeek]);
    useVisibleInterval(loadWeek, refreshMs);

    const days = useMemo(() => {
        const start = data?.start ? new Date(`${data.start}T00:00:00`) : new Date();
        start.setHours(0, 0, 0, 0);
        if (!data?.start) start.setDate(start.getDate() + (weekOffset * 7));
        return Array.from({ length: 7 }, (_, index) => {
            const date = new Date(start);
            date.setDate(start.getDate() + index);
            return date;
        });
    }, [data?.start, weekOffset]);
    const itemsByDay = useMemo(() => {
        const tv = summarizeSeasonReleaseBatches(mapSonarrCalendarItems(data?.sonarr?.calendar || []));
        const movies = mapRadarrCalendarItems(data?.radarr?.calendar || []);
        return [...tv, ...movies].reduce<Record<string, any[]>>((groups, item) => {
            const key = ymd(item.date);
            groups[key] = groups[key] || [];
            groups[key].push(item);
            return groups;
        }, {});
    }, [data?.radarr?.calendar, data?.sonarr?.calendar]);
    const configured = !!(data?.sonarr?.configured || data?.radarr?.configured);
    if (data && !configured) return null;

    const label = `${days[0].toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} - ${days[6].toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;

    return (
        <section className="glass-card overflow-hidden p-4 shadow-xl md:p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                    <h3 className="flex items-center gap-2 text-lg font-bold text-text md:text-xl"><CalendarDays className="h-5 w-5 text-plex" />Coming Up</h3>
                    <p className="mt-1 text-xs text-muted">TV and movie releases for {label}</p>
                </div>
                <div className="flex items-center rounded-lg border border-white/10 bg-white/5 p-1">
                    <button type="button" onClick={() => selectWeek(weekOffset - 1)} disabled={weekOffset <= -4} className="rounded-md p-1.5 text-muted hover:bg-white/10 hover:text-text disabled:opacity-30" aria-label="Previous week"><ChevronLeft className="h-4 w-4" /></button>
                    <button type="button" onClick={() => selectWeek(0)} className="px-2 text-[10px] font-bold uppercase tracking-wider text-muted hover:text-text">This week</button>
                    <button type="button" onClick={() => selectWeek(weekOffset + 1)} disabled={weekOffset >= 12} className="rounded-md p-1.5 text-muted hover:bg-white/10 hover:text-text disabled:opacity-30" aria-label="Next week"><ChevronRight className="h-4 w-4" /></button>
                </div>
            </div>
            <div className="overflow-x-auto pb-1">
                <div className="grid min-w-[48rem] grid-cols-7 gap-2" aria-live="polite">
                    {days.map((day) => {
                    const items = itemsByDay[ymd(day)] || [];
                    const isToday = ymd(day) === ymd(new Date());
                    return (
                        <div key={ymd(day)} className={`min-h-28 rounded-lg border p-2 ${isToday ? 'border-plex/50 bg-plex/5' : 'border-white/10 bg-background/25'}`}>
                            <div className="mb-2 flex items-center justify-between">
                                <span className="text-[10px] font-black uppercase tracking-wider text-muted">{day.toLocaleDateString(undefined, { weekday: 'short' })}</span>
                                <span className={`text-xs font-bold ${isToday ? 'text-plex' : 'text-text'}`}>{day.getDate()}</span>
                            </div>
                            <div className="space-y-1.5">
                                {items.slice(0, 3).map((item) => {
                                    const TypeIcon = item.type === 'tv' ? Tv : Film;
                                    return <div key={item.id} className="rounded-md border border-white/10 bg-card/80 p-1.5" title={`${item.title}${item.subtitle ? ` - ${item.subtitle}` : ''}`}><div className="flex items-center gap-1"><TypeIcon className={`h-3 w-3 shrink-0 ${item.type === 'tv' ? 'text-sky-300' : 'text-amber-300'}`} /><span className="line-clamp-2 text-[10px] font-bold leading-tight text-text">{item.title}</span></div>{item.subtitle && <p className="mt-1 line-clamp-1 text-[9px] text-muted">{item.subtitle}</p>}</div>;
                                })}
                                {items.length > 3 && <p className="text-[9px] font-bold text-muted">+{items.length - 3} more</p>}
                                {!items.length && <p className="pt-4 text-center text-[9px] text-muted/60">No releases</p>}
                            </div>
                        </div>
                    );
                    })}
                </div>
            </div>
        </section>
    );
};
