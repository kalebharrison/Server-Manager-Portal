import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { apiFetch } from '../../shared/api';
import { cacheRefreshMs } from '../../shared/cacheRefresh';
import { useVisibleInterval } from '../../shared/useVisibleInterval';
import { loadLocalPortalPreferences, saveLocalPortalPreferences } from '../../shared/userPreferences';
import {
    clampMonthOffset,
    groupCalendarItemsByDate,
    mapRadarrCalendarItems,
    mapSonarrCalendarItems,
    summarizeSeasonReleaseBatches,
} from './mediaStackUtils';

export type StackFilter = 'all' | 'sonarr' | 'radarr';
export type CalendarView = 'list' | 'month';

const AUTO_MONTH_SCAN_TTL_MS = 10 * 60 * 1000;

export const ymd = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export const useMediaStackDashboard = ({ cacheMinutes }: { cacheMinutes?: number }) => {
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

    const handleCalendarFilterChange = (optionId: StackFilter) => {
        setAutoMonthNotice('');
        setCalendarFilter(optionId);
        saveLocalPortalPreferences({
            ...loadLocalPortalPreferences(),
            calendarMediaType: optionId === 'sonarr' ? 'tv' : optionId === 'radarr' ? 'movie' : 'all',
        });
    };

    const handleCalendarViewChange = (view: CalendarView) => {
        setCalendarView(view);
        saveLocalPortalPreferences({ ...loadLocalPortalPreferences(), calendarView: view });
    };

    const handleMonthOffsetChange = (delta: number) => {
        setAutoMonthNotice('');
        setMonthOffset(m => clampMonthOffset(m + delta));
    };

    return {
        isLoading,
        error,
        calendarData,
        calendarView,
        calendarFilter,
        calendarFilterLabel,
        calendarConfigured,
        filteredCalendar,
        groupedCalendar,
        calendarByDay,
        monthCells,
        displayMonth,
        autoMonthNotice,
        handleCalendarFilterChange,
        handleCalendarViewChange,
        handleMonthOffsetChange,
    };
};

export type MediaStackDashboardState = ReturnType<typeof useMediaStackDashboard>;
