import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Calendar, ChevronLeft, ChevronRight, Clock, Film, Tv } from 'lucide-react';

import { apiFetch } from '../shared/api';
import { cacheRefreshMs } from '../shared/cacheRefresh';
import { formatTime } from '../shared/format';
import { Loader } from '../shared/toast';
import { useVisibleInterval } from '../shared/useVisibleInterval';
import { loadLocalPortalPreferences, saveLocalPortalPreferences } from '../shared/userPreferences';
import {
    clampMonthOffset,
    groupCalendarItemsByDate,
    mapRadarrCalendarItems,
    mapSonarrCalendarItems,
    summarizeSeasonReleaseBatches,
} from './media-stack/mediaStackUtils';

type StackFilter = 'all' | 'sonarr' | 'radarr';
type CalendarView = 'list' | 'month';

const AUTO_MONTH_SCAN_TTL_MS = 10 * 60 * 1000;
const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const mediaTypeLabel = (type: string) => type === 'tv' ? 'TV Show' : 'Movie';
const ymd = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export const MediaStackDashboard: React.FC<{ cacheMinutes?: number }> = ({ cacheMinutes }) => {
    const initialPreferences = useMemo(loadLocalPortalPreferences, []);
    const refreshMs = cacheRefreshMs({ cacheRefreshMinutes: cacheMinutes });
    const [data, setData] = useState<any>(null);
    const [listData, setListData] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');
    const [monthOffset, setMonthOffset] = useState(0);
    const [calendarFilter, setCalendarFilter] = useState<StackFilter>(() => initialPreferences.calendarMediaType === 'tv' ? 'sonarr' : initialPreferences.calendarMediaType === 'movie' ? 'radarr' : 'all');
    const [calendarView, setCalendarView] = useState<CalendarView>(initialPreferences.calendarView);
    const [autoMonthNotice, setAutoMonthNotice] = useState('');
    const autoMonthScanRef = useRef(new Map<string, number>());
    const monthSummaryCacheRef = useRef(new Map<number, { at: number; data: any }>());

    const displayMonth = useMemo(() => {
        const date = new Date();
        date.setFullYear(date.getFullYear(), date.getMonth() + monthOffset, 1);
        date.setHours(0, 0, 0, 0);
        return date;
    }, [monthOffset]);

    const fetchMonthSummary = useCallback(async (offset: number, { force = false } = {}) => {
        const safeOffset = clampMonthOffset(offset);
        const cached = monthSummaryCacheRef.current.get(safeOffset);
        if (!force && cached && Date.now() - cached.at < refreshMs) return cached.data;
        const res = await apiFetch('/api/media-stack/summary?monthOffset=' + safeOffset, { forceRefresh: force, cacheTtlMs: refreshMs });
        if (res.error) throw new Error(res.error);
        monthSummaryCacheRef.current.set(safeOffset, { at: Date.now(), data: res });
        return res;
    }, [refreshMs]);

    const fetchData = useCallback(async () => {
        try {
            if (calendarView === 'list') {
                const res = await apiFetch('/api/media-stack/calendar?horizon=quarter', { cacheTtlMs: refreshMs, staleIfErrorMs: 60 * 60_000 });
                if (res.error) throw new Error(res.error);
                setListData(res);
                void fetchMonthSummary(monthOffset).then(setData).catch(() => {});
            } else {
                setData(await fetchMonthSummary(monthOffset));
            }
            setError('');
        } catch (err: any) {
            setError(err.message || 'Failed to load release calendar.');
        } finally {
            setIsLoading(false);
        }
    }, [calendarView, fetchMonthSummary, monthOffset, refreshMs]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);
    useVisibleInterval(fetchData, refreshMs);

    const calendarData = calendarView === 'list' ? listData : data;
    const inListWindow = useCallback((item: any) => {
        if (calendarView !== 'list' || !calendarData?.start || !calendarData?.end) return true;
        const time = item.date.getTime();
        return time >= new Date(`${calendarData.start}T00:00:00`).getTime()
            && time < new Date(`${calendarData.end}T00:00:00`).getTime();
    }, [calendarData?.end, calendarData?.start, calendarView]);
    const sonarrCalendarItems = useMemo(() => mapSonarrCalendarItems(calendarData?.sonarr?.calendar || []).filter(inListWindow), [calendarData?.sonarr?.calendar, inListWindow]);
    const radarrCalendarItems = useMemo(() => mapRadarrCalendarItems(calendarData?.radarr?.calendar || []).filter(inListWindow), [calendarData?.radarr?.calendar, inListWindow]);
    const summarizedSonarrCalendarItems = useMemo(() => summarizeSeasonReleaseBatches(sonarrCalendarItems), [sonarrCalendarItems]);
    const allCalendarItems = useMemo(() => [...summarizedSonarrCalendarItems, ...radarrCalendarItems].sort((a, b) => a.date.getTime() - b.date.getTime()), [radarrCalendarItems, summarizedSonarrCalendarItems]);

    const filteredCalendar = useMemo(() => {
        if (calendarFilter === 'sonarr') return summarizedSonarrCalendarItems;
        if (calendarFilter === 'radarr') return radarrCalendarItems;
        return allCalendarItems;
    }, [allCalendarItems, calendarFilter, summarizedSonarrCalendarItems, radarrCalendarItems]);

    const calendarConfigured = calendarFilter === 'sonarr'
        ? !!calendarData?.sonarr?.configured
        : calendarFilter === 'radarr'
            ? !!calendarData?.radarr?.configured
            : !!(calendarData?.sonarr?.configured || calendarData?.radarr?.configured);

    const calendarFilterLabel = calendarFilter === 'sonarr'
        ? 'TV releases'
        : calendarFilter === 'radarr'
            ? 'movie releases'
            : 'TV and movie releases';

    useEffect(() => {
        let cancelled = false;
        const maybeAutoSelectMonthWithReleases = async () => {
            if (calendarView !== 'month' || !calendarConfigured || !data || monthOffset !== 0 || filteredCalendar.length > 0) {
                if (!cancelled && monthOffset === 0) setAutoMonthNotice('');
                return;
            }
            const scanKey = `${calendarFilter}:${monthOffset}`;
            const lastScanAt = autoMonthScanRef.current.get(scanKey) || 0;
            if (Date.now() - lastScanAt < AUTO_MONTH_SCAN_TTL_MS) return;
            autoMonthScanRef.current.set(scanKey, Date.now());
            for (let offset = 1; offset <= 6; offset += 1) {
                try {
                    const res = await fetchMonthSummary(offset);
                    const sonarrCount = Array.isArray(res?.sonarr?.calendar) ? res.sonarr.calendar.length : 0;
                    const radarrCount = Array.isArray(res?.radarr?.calendar) ? res.radarr.calendar.length : 0;
                    const count = calendarFilter === 'sonarr' ? sonarrCount : calendarFilter === 'radarr' ? radarrCount : sonarrCount + radarrCount;
                    if (count > 0) {
                        if (cancelled) return;
                        setData(res);
                        setMonthOffset(offset);
                        setAutoMonthNotice(`Showing the next month with ${calendarFilterLabel} (${new Date(new Date().setFullYear(new Date().getFullYear(), new Date().getMonth() + offset, 1)).toLocaleDateString('default', { month: 'long', year: 'numeric' })}).`);
                        return;
                    }
                } catch {
                    // Best-effort UX fallback. Keep trying later months.
                }
            }
            if (!cancelled) setAutoMonthNotice(`No ${calendarFilterLabel} found in the next 6 months.`);
        };
        maybeAutoSelectMonthWithReleases();
        return () => {
            cancelled = true;
        };
    }, [calendarConfigured, calendarFilter, calendarFilterLabel, calendarView, fetchMonthSummary, filteredCalendar.length, data, monthOffset]);

    const groupedCalendar = useMemo(() => groupCalendarItemsByDate(filteredCalendar), [filteredCalendar]);
    const calendarByDay = useMemo(() => {
        const groups: Record<string, typeof filteredCalendar> = {};
        filteredCalendar.forEach((item) => {
            const key = ymd(item.date);
            groups[key] = groups[key] || [];
            groups[key].push(item);
        });
        return groups;
    }, [filteredCalendar]);

    const monthCells = useMemo(() => {
        const first = new Date(displayMonth.getFullYear(), displayMonth.getMonth(), 1);
        const start = new Date(first);
        start.setDate(first.getDate() - first.getDay());
        return Array.from({ length: 42 }, (_, index) => {
            const date = new Date(start);
            date.setDate(start.getDate() + index);
            return date;
        });
    }, [displayMonth]);

    if (isLoading) return <Loader isLoading={true} />;
    if (error) return <div className="text-center p-8 text-status-expiring">{error}</div>;
    if (!calendarData) return null;

    const renderCalendarItem = (item: any) => (
        <article
            key={item.id}
            className={`bg-card/80 hover:bg-card transition-colors rounded-xl p-3 flex gap-3 border-l-4 shadow-md min-w-0 ${item.hasFile ? 'border-l-green-500/80' : item.monitored ? 'border-l-red-500/80' : 'border-l-blue-500/80'} border-y border-r border-white/5 hover:border-white/20`}
        >
            <div className="w-14 sm:w-16 aspect-[2/3] rounded-lg overflow-hidden bg-background/70 border border-white/10 flex-shrink-0">
                {item.imageUrl ? (
                    <img src={item.imageUrl} alt={item.title} className="w-full h-full object-cover" loading="lazy" decoding="async" />
                ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted/40">
                        {item.type === 'tv' ? <Tv className="w-6 h-6" /> : <Film className="w-6 h-6" />}
                    </div>
                )}
            </div>
            <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border ${item.type === 'tv' ? 'text-sky-200 bg-sky-500/10 border-sky-500/20' : 'text-amber-200 bg-amber-500/10 border-amber-500/20'}`}>
                        {mediaTypeLabel(item.type)}
                    </span>
                    <span className="text-[11px] text-plex flex items-center gap-1 font-bold tracking-wide">
                        <Clock className="w-3.5 h-3.5" />
                        {formatTime(item.date).replace(/^0:/, '12:')}
                    </span>
                    {item.network && <span className="text-[10px] text-muted uppercase tracking-wider truncate max-w-[10rem]">{item.network}</span>}
                </div>
                <h4 className="font-bold text-sm md:text-base text-text leading-snug break-words line-clamp-2">{item.title}</h4>
                <p className="text-xs md:text-sm text-muted/85 line-clamp-2 mt-1 leading-relaxed">{item.subtitle}</p>
            </div>
            <div className="hidden sm:flex flex-col items-end gap-2 flex-shrink-0">
                {item.hasFile ? (
                    <span className="text-[10px] font-bold text-green-400 bg-green-500/10 border border-green-500/20 rounded-md px-2 py-1 whitespace-nowrap">Ready</span>
                ) : item.monitored ? (
                    <span className="text-[10px] font-bold text-plex bg-plex/10 border border-plex/20 rounded-md px-2 py-1 flex items-center gap-1.5 whitespace-nowrap">
                        <span className="w-1.5 h-1.5 rounded-full bg-plex animate-pulse" />
                        Monitored
                    </span>
                ) : (
                    <span className="text-[10px] font-bold text-muted bg-white/5 border border-white/10 rounded-md px-2 py-1 whitespace-nowrap">Unmonitored</span>
                )}
            </div>
        </article>
    );

    return (
        <div className="w-full animate-fade-in flex flex-col gap-6">
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-2">
                <div>
                    <h1 className="text-3xl font-bold text-text uppercase tracking-widest flex items-center gap-3">
                        <Calendar className="w-8 h-8 text-plex" />
                        Release Calendar
                    </h1>
                    <p className="text-muted text-sm mt-1">TV and movie release schedule.</p>
                </div>
            </div>

            <div className="bg-card border border-white/5 shadow-2xl rounded-2xl p-4 md:p-6 relative">
                <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4 mb-4 md:mb-6 border-b border-border/30 pb-4">
                    <div>
                        <h2 className="text-xl font-bold text-text flex items-center gap-2">
                            <Calendar className="w-5 h-5 text-plex flex-shrink-0" />
                            Releases
                        </h2>
                        <p className="text-xs text-muted mt-1">{filteredCalendar.length} {calendarFilterLabel} {calendarView === 'list' ? 'from this week through the next three months.' : 'in the selected month.'}</p>
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                        <div className="flex bg-white/5 p-1 rounded-lg border border-white/10 w-fit">
                            {[
                                { id: 'all' as const, label: 'All' },
                                { id: 'sonarr' as const, label: 'TV' },
                                { id: 'radarr' as const, label: 'Movies' },
                            ].map(option => (
                                <button
                                    key={option.id}
                                    type="button"
                                    onClick={() => { setAutoMonthNotice(''); setCalendarFilter(option.id); saveLocalPortalPreferences({ ...loadLocalPortalPreferences(), calendarMediaType: option.id === 'sonarr' ? 'tv' : option.id === 'radarr' ? 'movie' : 'all' }); }}
                                    className={`px-3 py-1.5 rounded-md text-[11px] font-bold uppercase tracking-wider transition-colors ${calendarFilter === option.id ? 'bg-plex text-background' : 'text-muted hover:text-text hover:bg-white/5'}`}
                                >
                                    {option.label}
                                </button>
                            ))}
                        </div>
                        <div className="flex bg-white/5 p-1 rounded-lg border border-white/10 w-fit">
                            {[
                                { id: 'list' as const, label: 'List' },
                                { id: 'month' as const, label: 'Month' },
                            ].map(option => (
                                <button
                                    key={option.id}
                                    type="button"
                                    onClick={() => { setCalendarView(option.id); saveLocalPortalPreferences({ ...loadLocalPortalPreferences(), calendarView: option.id }); }}
                                    className={`px-3 py-1.5 rounded-md text-[11px] font-bold uppercase tracking-wider transition-colors ${calendarView === option.id ? 'bg-plex text-background' : 'text-muted hover:text-text hover:bg-white/5'}`}
                                >
                                    {option.label}
                                </button>
                            ))}
                        </div>
                        {calendarView === 'month' ? <div className="flex bg-white/5 p-1 rounded-xl border border-white/10 w-fit flex-shrink-0 items-center gap-2">
                            <button type="button" onClick={() => { setAutoMonthNotice(''); setMonthOffset(m => clampMonthOffset(m - 1)); }} className="p-1.5 hover:bg-white/10 rounded-lg text-muted hover:text-text transition-colors">
                                <ChevronLeft className="w-4 h-4" />
                            </button>
                            <span className="text-xs font-bold px-2 w-28 text-center text-text uppercase tracking-wider">
                                {displayMonth.toLocaleDateString('default', { month: 'short', year: 'numeric' })}
                            </span>
                            <button type="button" onClick={() => { setAutoMonthNotice(''); setMonthOffset(m => clampMonthOffset(m + 1)); }} className="p-1.5 hover:bg-white/10 rounded-lg text-muted hover:text-text transition-colors">
                                <ChevronRight className="w-4 h-4" />
                            </button>
                        </div> : <span className="px-3 py-2 text-xs font-bold uppercase tracking-wider text-muted">This week + 3 months</span>}
                    </div>
                </div>

                {calendarView === 'month' && autoMonthNotice && <p className="text-xs text-plex/90 mb-3">{autoMonthNotice}</p>}

                {filteredCalendar.length === 0 ? (
                    <div className="text-center py-12 bg-background/30 rounded-xl border border-white/5 text-muted text-sm">
                        <Calendar className="w-12 h-12 text-muted/30 mx-auto mb-3" />
                        {!calendarConfigured ? (
                            <>
                                <p>No calendar source is configured for this filter.</p>
                                <p className="text-xs mt-2">Add TV or movie automation in Settings → Integrations.</p>
                            </>
                        ) : (
                            <p>No upcoming {calendarFilterLabel} {calendarView === 'list' ? 'in the next three months.' : 'for this month.'}</p>
                        )}
                    </div>
                ) : calendarView === 'month' ? (
                    <div>
                        <div className="grid grid-cols-7 gap-2 mb-2">
                            {weekDays.map((day) => <div key={day} className="text-[10px] font-black uppercase tracking-wider text-muted text-center">{day}</div>)}
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-7 gap-2">
                            {monthCells.map((date) => {
                                const inMonth = date.getMonth() === displayMonth.getMonth();
                                const items = calendarByDay[ymd(date)] || [];
                                return (
                                    <div key={ymd(date)} className={`min-h-28 rounded-xl border p-2 ${inMonth ? 'border-white/10 bg-background/25' : 'border-white/5 bg-background/10 opacity-50'}`}>
                                        <div className="text-xs font-bold text-muted mb-2">{date.getDate()}</div>
                                        <div className="space-y-1">
                                            {items.slice(0, 3).map((item) => (
                                                <div key={item.id} className={`rounded-md border px-2 py-1 text-[10px] font-bold line-clamp-2 ${item.type === 'tv' ? 'text-sky-100 bg-sky-500/10 border-sky-500/20' : 'text-amber-100 bg-amber-500/10 border-amber-500/20'}`} title={item.title}>
                                                    {item.type === 'tv' ? 'TV' : 'Movie'} · {item.title}
                                                </div>
                                            ))}
                                            {items.length > 3 && <div className="text-[10px] text-muted font-bold">+{items.length - 3} more</div>}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ) : (
                    <div className="space-y-5">
                        {Object.entries(groupedCalendar).map(([dateStr, items]: [string, typeof filteredCalendar]) => (
                            <section key={dateStr} className="rounded-xl border border-white/10 bg-background/25 overflow-hidden">
                                <div className="flex items-center justify-between gap-3 px-3 md:px-4 py-3 border-b border-white/10 bg-white/[0.03]">
                                    <h3 className="text-base md:text-lg font-black text-text tracking-tight uppercase">{dateStr}</h3>
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted">{items.length} release{items.length === 1 ? '' : 's'}</span>
                                </div>
                                <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 p-3 md:p-4">
                                    {items.map(renderCalendarItem)}
                                </div>
                            </section>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};
