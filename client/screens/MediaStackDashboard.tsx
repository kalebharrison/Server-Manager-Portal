import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Activity, Calendar, Check, ChevronLeft, ChevronRight, Clock, DownloadCloud, FileText, Film, HardDrive, List, Settings, Tv } from 'lucide-react';

import { apiFetch } from '../shared/api';
import { formatTime } from '../shared/format';
import { Loader } from '../shared/toast';
import { useVisibleInterval } from '../shared/useVisibleInterval';
import {
    clampMonthOffset,
    formatBytes,
    formatEventType,
    formatRelativeAirDate,
    getHistoryColor,
    groupCalendarItemsByDate,
    mapQueueRecords,
    mapRadarrCalendarItems,
    mapRadarrHistoryItems,
    mapSonarrCalendarItems,
    mapSonarrHistoryItems,
} from './media-stack/mediaStackUtils';

const AUTO_MONTH_SCAN_TTL_MS = 10 * 60 * 1000;
const MONTH_SUMMARY_CACHE_TTL_MS = 2 * 60 * 1000;

export const MediaStackDashboard: React.FC<{ isAdmin: boolean }> = ({ isAdmin }) => {
    const [data, setData] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');
    const [monthOffset, setMonthOffset] = useState(0);
    const [activeStackTab, setActiveStackTab] = useState<'sonarr' | 'radarr'>('sonarr');
    const [activeCalendarItem, setActiveCalendarItem] = useState<any>(null);
    const [autoMonthNotice, setAutoMonthNotice] = useState('');
    const autoMonthScanRef = useRef(new Map<string, number>());
    const monthSummaryCacheRef = useRef(new Map<number, { at: number; data: any }>());

    const fetchMonthSummary = useCallback(async (offset: number, { force = false } = {}) => {
        const safeOffset = clampMonthOffset(offset);
        const cached = monthSummaryCacheRef.current.get(safeOffset);
        if (!force && cached && Date.now() - cached.at < MONTH_SUMMARY_CACHE_TTL_MS) {
            return cached.data;
        }
        const res = await apiFetch('/api/media-stack/summary?monthOffset=' + safeOffset, { forceRefresh: force });
        if (res.error) throw new Error(res.error);
        monthSummaryCacheRef.current.set(safeOffset, { at: Date.now(), data: res });
        return res;
    }, []);

    const switchStackTab = (tab: 'sonarr' | 'radarr') => {
        if (tab === activeStackTab) return;
        setActiveStackTab(tab);
        setAutoMonthNotice('');
        setMonthOffset(0);
    };

    const fetchData = useCallback(async () => {
        try {
            const res = await fetchMonthSummary(monthOffset, { force: true });
            setData(res);
        } catch (err: any) {
            setError(err.message || 'Failed to load Media Stack data.');
        } finally {
            setIsLoading(false);
        }
    }, [fetchMonthSummary, monthOffset]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);
    useVisibleInterval(fetchData, 30000);

    const sonarrCalendarItems = useMemo(() => {
        return mapSonarrCalendarItems(data?.sonarr?.calendar || []);
    }, [data?.sonarr?.calendar]);

    const radarrCalendarItems = useMemo(() => {
        return mapRadarrCalendarItems(data?.radarr?.calendar || []);
    }, [data?.radarr?.calendar]);

    const filteredCalendar = useMemo(() => {
        return activeStackTab === 'sonarr' ? sonarrCalendarItems : radarrCalendarItems;
    }, [activeStackTab, sonarrCalendarItems, radarrCalendarItems]);

    const activeStackConfigured = activeStackTab === 'sonarr'
        ? !!data?.sonarr?.configured
        : !!data?.radarr?.configured;

    const activeStackLabel = activeStackTab === 'sonarr' ? 'Sonarr' : 'Radarr';

    useEffect(() => {
        let cancelled = false;
        const maybeAutoSelectMonthWithReleases = async () => {
            if (!activeStackConfigured || !data || monthOffset !== 0 || filteredCalendar.length > 0) {
                if (!cancelled && monthOffset === 0) {
                    setAutoMonthNotice('');
                }
                return;
            }
            const scanKey = `${activeStackTab}:${monthOffset}`;
            const lastScanAt = autoMonthScanRef.current.get(scanKey) || 0;
            if (Date.now() - lastScanAt < AUTO_MONTH_SCAN_TTL_MS) return;
            autoMonthScanRef.current.set(scanKey, Date.now());
            for (let offset = 1; offset <= 6; offset += 1) {
                try {
                    const res = await fetchMonthSummary(offset);
                    const count = activeStackTab === 'sonarr'
                        ? (Array.isArray(res?.sonarr?.calendar) ? res.sonarr.calendar.length : 0)
                        : (Array.isArray(res?.radarr?.calendar) ? res.radarr.calendar.length : 0);
                    if (count > 0) {
                        if (cancelled) return;
                        setData(res);
                        setMonthOffset(offset);
                        setAutoMonthNotice(`Showing the next month with ${activeStackTab === 'sonarr' ? 'TV' : 'movie'} releases (${new Date(new Date().setFullYear(new Date().getFullYear(), new Date().getMonth() + offset, 1)).toLocaleDateString('default', { month: 'long', year: 'numeric' })}).`);
                        return;
                    }
                } catch {
                    // Keep trying next month; this is a best-effort UX fallback.
                }
            }
            if (!cancelled) {
                setAutoMonthNotice(`No ${activeStackTab === 'sonarr' ? 'TV' : 'movie'} releases found in the next 6 months.`);
            }
        };
        maybeAutoSelectMonthWithReleases();
        return () => {
            cancelled = true;
        };
    }, [activeStackConfigured, activeStackTab, fetchMonthSummary, filteredCalendar.length, data, monthOffset]);

    const groupedCalendar = useMemo(() => {
        return groupCalendarItemsByDate(filteredCalendar);
    }, [filteredCalendar]);

    useEffect(() => {
        if (filteredCalendar.length > 0) {
            setActiveCalendarItem((prev: any) => {
                if (prev && filteredCalendar.find(i => i.id === prev.id)) return prev;
                return filteredCalendar[0];
            });
        } else {
            setActiveCalendarItem(null);
        }
    }, [filteredCalendar]);

    const sonarrQueue = useMemo(() => {
        return mapQueueRecords(data?.sonarr?.queue?.records || [], 'Sonarr');
    }, [data?.sonarr?.queue?.records]);

    const radarrQueue = useMemo(() => {
        return mapQueueRecords(data?.radarr?.queue?.records || [], 'Radarr');
    }, [data?.radarr?.queue?.records]);

    const activeQueue = useMemo(() => {
        return activeStackTab === 'sonarr' ? sonarrQueue : radarrQueue;
    }, [activeStackTab, sonarrQueue, radarrQueue]);

    const sonarrHistory = useMemo(() => {
        return mapSonarrHistoryItems(data?.sonarr?.history?.records || []);
    }, [data?.sonarr?.history?.records]);

    const radarrHistory = useMemo(() => {
        return mapRadarrHistoryItems(data?.radarr?.history?.records || []);
    }, [data?.radarr?.history?.records]);

    const activeHistory = useMemo(() => {
        return activeStackTab === 'sonarr' ? sonarrHistory : radarrHistory;
    }, [activeStackTab, sonarrHistory, radarrHistory]);

    if (isLoading) return <Loader isLoading={true} />;
    if (error) return <div className="text-center p-8 text-status-expiring">{error}</div>;
    if (!data) return null;

    const renderStatusCard = (name: string, info: any) => {
        if (!info || !info.configured) {
            return (
                <div className="bg-card border border-border/40 rounded-2xl p-4 md:p-6 shadow-xl flex flex-col justify-between h-44 relative overflow-hidden">
                    <div className="flex justify-between items-start">
                        <h3 className="text-lg font-bold text-text/80">{name}</h3>
                        <span className="text-[10px] uppercase font-bold tracking-widest px-2 py-0.5 rounded bg-white/5 text-muted border border-white/5">Unconfigured</span>
                    </div>
                    <p className="text-xs text-muted leading-relaxed">Please set the URL and API key in Settings under the Media Stack tab to activate monitoring.</p>
                    <div className="text-right">
                        <span className="text-xs font-bold text-plex hover:underline cursor-pointer">Configure in Settings →</span>
                    </div>
                </div>
            );
        }

        const status = info.status;
        const disk = info.disk ? info.disk[0] : null;
        const freeGB = disk ? (disk.freeSpace / 1024 / 1024 / 1024) : 0;
        const totalGB = disk ? (disk.totalSpace / 1024 / 1024 / 1024) : 1;
        const freePercent = disk ? (freeGB / totalGB) * 100 : 0;
        const usedPercent = 100 - freePercent;
        const isReachable = !!status;

        return (
            <div className="bg-card border border-white/5 shadow-2xl rounded-2xl p-4 md:p-6 relative overflow-hidden backdrop-blur-sm group hover:border-white/10 transition-all duration-300">
                <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-all duration-500">
                    <HardDrive className="w-24 h-24" />
                </div>

                <div className="flex items-center gap-4 mb-4">
                    <div className="w-10 h-10 rounded-xl bg-plex/10 flex items-center justify-center border border-plex/20">
                        {name === 'Sonarr' ? <Tv className="w-5 h-5 text-plex" /> : <Film className="w-5 h-5 text-plex" />}
                    </div>
                    <div>
                        <h3 className="text-lg font-bold text-text tracking-wide">{name}</h3>
                        <div className="flex items-center gap-2 mt-0.5">
                            <span className={`w-2 h-2 rounded-full ${isReachable ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)] animate-pulse' : 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]'}`}></span>
                            <span className={`text-[10px] font-bold tracking-wider uppercase ${isReachable ? 'text-green-500' : 'text-red-400'}`}>{isReachable ? 'Online' : 'Unavailable'}</span>
                            {status?.version && <span className="text-[10px] text-muted font-bold">v{status.version}</span>}
                        </div>
                    </div>
                </div>
                {!isReachable && (
                    <p className="text-[11px] text-red-300 mb-2">Unable to fetch data from {name}. Check URL/API key and local network reachability.</p>
                )}

                {disk && (
                    <div className="bg-background/40 rounded-xl p-3 border border-white/5 mt-2">
                        <div className="flex justify-between items-end mb-1">
                            <span className="text-[10px] font-bold text-muted uppercase tracking-wider">Free Storage</span>
                            <span className="text-xs font-bold text-text">{freeGB.toFixed(1)} GB free</span>
                        </div>
                        <div className="w-full bg-white/5 rounded-full h-2 overflow-hidden">
                            <div className="bg-plex h-full rounded-full transition-all duration-500" style={{ width: `${usedPercent}%` }}></div>
                        </div>
                        <div className="flex justify-between text-[9px] text-muted/60 mt-1 font-medium">
                            <span>{usedPercent.toFixed(0)}% Used</span>
                            <span>{totalGB.toFixed(0)} GB Total</span>
                        </div>
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="w-full animate-fade-in flex flex-col gap-6">
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-2">
                <div>
                    <h1 className="text-3xl font-bold text-text uppercase tracking-widest flex items-center gap-3">
                        {activeStackTab === 'sonarr' ? <Tv className="w-8 h-8 text-plex" /> : <Film className="w-8 h-8 text-plex" />}
                        {activeStackLabel}
                    </h1>
                    <p className="text-muted text-sm mt-1">
                        {activeStackTab === 'sonarr' ? 'TV series releases, downloads, and activity' : 'Movie releases, downloads, and activity'}
                    </p>
                </div>

                <div className="flex bg-white/5 p-1 rounded-lg md:rounded-xl border border-white/10 w-fit">
                    <button
                        type="button"
                        onClick={() => switchStackTab('sonarr')}
                        className={`flex items-center gap-1.5 md:gap-2 px-3 md:px-4 py-1.5 md:py-2 rounded-md md:rounded-lg text-[11px] md:text-xs font-bold uppercase tracking-wider transition-all ${activeStackTab === 'sonarr' ? 'bg-plex text-background shadow-lg shadow-plex/20' : 'text-muted hover:text-text hover:bg-white/5'}`}
                    >
                        <Tv className="w-3.5 h-3.5 md:w-4 md:h-4" />
                        Sonarr
                    </button>
                    <button
                        type="button"
                        onClick={() => switchStackTab('radarr')}
                        className={`flex items-center gap-1.5 md:gap-2 px-3 md:px-4 py-1.5 md:py-2 rounded-md md:rounded-lg text-[11px] md:text-xs font-bold uppercase tracking-wider transition-all ${activeStackTab === 'radarr' ? 'bg-plex text-background shadow-lg shadow-plex/20' : 'text-muted hover:text-text hover:bg-white/5'}`}
                    >
                        <Film className="w-3.5 h-3.5 md:w-4 md:h-4" />
                        Radarr
                    </button>
                </div>
            </div>

            <div className="flex flex-col gap-8 w-full">

                <div className="w-full">

                    <div className="bg-card border border-white/5 shadow-2xl rounded-2xl p-4 md:p-6 relative">
                        <div className="flex flex-row justify-between items-center mb-4 md:mb-6 border-b border-border/30 pb-3 md:pb-4 gap-2">
                            <h2 className="text-base sm:text-xl font-bold text-text flex items-center gap-1.5 md:gap-2 truncate">
                                <Calendar className="w-4 h-4 sm:w-5 sm:h-5 text-plex flex-shrink-0" />
                                <span className="truncate">Upcoming Releases</span>
                            </h2>

                            <div className="flex bg-white/5 p-0.5 md:p-1 rounded-lg md:rounded-xl border border-white/10 w-fit flex-shrink-0 items-center gap-1 md:gap-2">
                                <button onClick={() => { setAutoMonthNotice(''); setMonthOffset(m => clampMonthOffset(m - 1)); }} className="p-1 md:p-1.5 hover:bg-white/10 rounded-md md:rounded-lg text-muted hover:text-text transition-colors">
                                    <ChevronLeft className="w-3 h-3 md:w-4 md:h-4" />
                                </button>
                                <span className="text-[10px] md:text-xs font-bold px-1 w-16 md:w-28 text-center text-text uppercase tracking-wider">
                                    {new Date(new Date().setFullYear(new Date().getFullYear(), new Date().getMonth() + monthOffset, 1)).toLocaleDateString('default', { month: 'short', year: 'numeric' })}
                                </span>
                                <button onClick={() => { setAutoMonthNotice(''); setMonthOffset(m => clampMonthOffset(m + 1)); }} className="p-1 md:p-1.5 hover:bg-white/10 rounded-md md:rounded-lg text-muted hover:text-text transition-colors">
                                    <ChevronRight className="w-3 h-3 md:w-4 md:h-4" />
                                </button>
                            </div>
                        </div>
                        {autoMonthNotice && (
                            <p className="text-xs text-plex/90 mb-3">{autoMonthNotice}</p>
                        )}

                        {filteredCalendar.length === 0 ? (
                            <div className="text-center py-12 bg-background/30 rounded-xl border border-white/5 text-muted text-sm">
                                <Calendar className="w-12 h-12 text-muted/30 mx-auto mb-3" />
                                {!activeStackConfigured ? (
                                    <>
                                        <p>{activeStackLabel} is not configured yet.</p>
                                        <p className="text-xs mt-2">Add the URL and API key in Settings → Integrations.</p>
                                    </>
                                ) : (
                                    <p>No upcoming {activeStackTab === 'sonarr' ? 'TV' : 'movie'} releases for this month</p>
                                )}
                            </div>
                        ) : (
                            <div className="flex items-start gap-3 md:gap-8 w-full">
                                {/* Left Sticky Poster */}
                                <div className="sticky top-[64px] md:top-[88px] w-[120px] sm:w-[160px] md:w-[320px] flex-shrink-0">
                                    <div className="flex flex-col gap-4 mt-8 md:mt-0">
                                        <div className="relative aspect-[2/3] rounded-lg md:rounded-2xl overflow-hidden shadow-2xl border border-white/10 group bg-card">
                                            {activeCalendarItem?.imageUrl ? (
                                                <img src={activeCalendarItem.imageUrl} alt={activeCalendarItem.title} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
                                            ) : (
                                                <div className="w-full h-full flex flex-col items-center justify-center opacity-30">
                                                    {activeCalendarItem?.type === 'tv' ? <Tv className="w-10 h-10 md:w-20 md:h-20 mb-2 md:mb-4" /> : <Film className="w-10 h-10 md:w-20 md:h-20 mb-2 md:mb-4" />}
                                                    <span className="font-bold uppercase tracking-widest text-[8px] md:text-sm">No Poster</span>
                                                </div>
                                            )}
                                            <div className="absolute inset-0 bg-gradient-to-b from-black/80 via-transparent to-transparent flex flex-col justify-start p-2 md:p-4">
                                                {activeCalendarItem?.network && (
                                                    <span className="hidden md:block text-sm text-white/90 uppercase tracking-widest font-bold text-left drop-shadow-lg">{activeCalendarItem.network}</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Right Side: Vertical List */}
                                <div className="flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6 md:gap-8 pb-4">
                                    {Object.entries(groupedCalendar).map(([dateStr, items]: [string, typeof filteredCalendar]) => (
                                        <div key={dateStr} className="flex flex-col gap-2 md:gap-3">
                                            <div className="sticky top-[64px] md:top-0 bg-card z-20 py-1 md:py-3 border-b border-white/10 md:mb-2 -mx-4 px-4 md:mx-0 md:px-0 shadow-[0_10px_20px_-10px_rgba(0,0,0,0.5)]">
                                                <h3 className="text-sm md:text-xl font-black text-plex md:text-text tracking-tight uppercase">{dateStr}</h3>
                                            </div>
                                            {items.map(item => (
                                                <div
                                                    key={item.id}
                                                    onMouseEnter={() => setActiveCalendarItem(item)}
                                                    onClick={() => setActiveCalendarItem(item)}
                                                    className={`bg-background/40 hover:bg-background/80 transition-all duration-300 rounded-lg md:rounded-xl p-2.5 md:p-4 flex flex-col gap-2 md:gap-3 shadow-md border-l-4 cursor-pointer group ${item.hasFile ? 'border-l-green-500/80' : item.monitored ? 'border-l-red-500/80' : 'border-l-blue-500/80'} ${activeCalendarItem?.id === item.id ? 'bg-white/10 border border-white/30 scale-[1.01] md:scale-[1.02]' : 'border border-white/5 hover:border-white/20'}`}
                                                >
                                                    <div className="flex justify-between items-start gap-2 md:gap-3">
                                                        <div className="min-w-0 flex-grow">
                                                            <div className="flex items-center gap-1.5 md:gap-2 mb-1 md:mb-2">
                                                                <span className="text-[9px] md:text-[11px] text-plex flex items-center gap-1 md:gap-1.5 font-bold tracking-wide">
                                                                    <Clock className="w-3 h-3 md:w-3.5 md:h-3.5" />
                                                                    {formatTime(item.date).replace(/^0:/, '12:')}
                                                                </span>
                                                            </div>
                                                            <h4 className="font-bold text-xs sm:text-sm text-text line-clamp-2 md:line-clamp-3 leading-tight group-hover:text-plex transition-colors">
                                                                {item.title}
                                                            </h4>
                                                            <p className="text-[10px] md:text-[12px] text-muted/80 line-clamp-2 mt-0.5 md:mt-1 font-medium">
                                                                {item.subtitle}
                                                            </p>
                                                        </div>
                                                        <div className="flex flex-col items-end gap-1.5 md:gap-2 flex-shrink-0">
                                                            {item.hasFile ? (
                                                                <span className="text-[8px] md:text-[10px] font-bold text-green-500 bg-green-500/10 border border-green-500/20 rounded md:rounded-md px-1.5 py-0.5 md:px-2 md:py-1 whitespace-nowrap">
                                                                    ✓ Ready
                                                                </span>
                                                            ) : (
                                                                item.monitored && (
                                                                    <span className="text-[8px] md:text-[10px] font-bold text-plex bg-plex/10 border border-plex/20 rounded md:rounded-md px-1.5 py-0.5 md:px-2 md:py-1 flex items-center gap-1 md:gap-1.5 whitespace-nowrap">
                                                                        <span className="w-1 h-1 md:w-1.5 md:h-1.5 rounded-full bg-plex animate-pulse"></span>
                                                                        Monitored
                                                                    </span>
                                                                )
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    <div className="flex flex-col gap-8">
                        <div className="bg-card border border-white/5 shadow-2xl rounded-2xl p-4 md:p-6 relative flex-grow flex flex-col">
                            <h2 className="text-xl font-bold text-text mb-4 flex items-center gap-2">
                                <Activity className="w-5 h-5 text-plex" />
                                {activeStackLabel} Downloads ({activeQueue.length})
                            </h2>

                            <div className="flex flex-col gap-3 flex-grow justify-start">
                                {!activeStackConfigured ? (
                                    <div className="text-center py-8 bg-background/30 rounded-xl border border-white/5 text-muted text-sm flex-grow flex flex-col justify-center items-center">
                                        <DownloadCloud className="w-10 h-10 text-muted/30 mx-auto mb-2" />
                                        <p>{activeStackLabel} is not configured.</p>
                                    </div>
                                ) : activeQueue.length === 0 ? (
                                    <div className="text-center py-8 bg-background/30 rounded-xl border border-white/5 text-muted text-sm flex-grow flex flex-col justify-center items-center">
                                        <DownloadCloud className="w-10 h-10 text-muted/30 mx-auto mb-2" />
                                        No active {activeStackTab === 'sonarr' ? 'TV' : 'movie'} downloads
                                    </div>
                                ) : (
                                    activeQueue.map((item: any) => {
                                        const downloaded = item.size - item.sizeleft;
                                        const progress = item.size > 0 ? (downloaded / item.size) * 100 : 0;

                                        return (
                                            <div key={item.id} className="bg-background/40 hover:bg-background/60 transition-all rounded-xl p-4 border border-white/5 flex flex-col gap-2">
                                                <div className="flex justify-between items-start gap-4">
                                                    <div className="flex flex-col gap-1 min-w-0">
                                                        <span className="font-bold text-sm text-text line-clamp-1 leading-snug">{item.title}</span>
                                                        <span className="text-[10px] text-muted/60 font-semibold">{item.timeleft || 'Unknown time'} left</span>
                                                    </div>
                                                    <span className="text-[10px] font-bold px-2 py-0.5 bg-plex/10 text-plex rounded-md border border-plex/20 uppercase tracking-wider">{item.status}</span>
                                                </div>
                                                <div className="w-full bg-white/5 rounded-full h-2 overflow-hidden mt-1 relative">
                                                    <div className="bg-plex h-full rounded-full transition-all duration-500" style={{ width: `${progress}%` }}></div>
                                                </div>
                                                <div className="flex justify-between text-[10px] text-muted/60 mt-0.5 font-medium">
                                                    <span>{progress.toFixed(1)}%</span>
                                                    <span>{formatBytes(downloaded)} / {formatBytes(item.size)}</span>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-col gap-4">
                        <h2 className="text-xl font-bold text-text flex items-center gap-2 mb-1">
                            {activeStackTab === 'sonarr' ? <Tv className="w-5 h-5 text-plex" /> : <Film className="w-5 h-5 text-plex" />}
                            {activeStackLabel} Status
                        </h2>
                        {renderStatusCard(activeStackLabel, activeStackTab === 'sonarr' ? data.sonarr : data.radarr)}
                    </div>

                    <div className="bg-card border border-white/5 shadow-2xl rounded-2xl p-4 md:p-6 relative flex-grow flex flex-col">
                        <h2 className="text-xl font-bold text-text mb-4 flex items-center gap-2">
                            <FileText className="w-5 h-5 text-plex" />
                            {activeStackLabel} History
                        </h2>

                        <div className="flex flex-col gap-3 flex-grow justify-start">
                            {!activeStackConfigured ? (
                                <div className="text-center py-12 bg-background/30 rounded-xl border border-white/5 text-muted text-sm flex-grow flex flex-col justify-center items-center">
                                    <p>{activeStackLabel} is not configured.</p>
                                </div>
                            ) : activeHistory.length === 0 ? (
                                <div className="text-center py-12 bg-background/30 rounded-xl border border-white/5 text-muted text-sm flex-grow flex flex-col justify-center items-center">
                                    No recent {activeStackTab === 'sonarr' ? 'TV' : 'movie'} history
                                </div>
                            ) : (
                                activeHistory.map((item: any) => (
                                    <div key={item.id} className="flex items-center gap-3 bg-background/30 rounded-xl p-3 border border-white/5 hover:bg-background/50 transition-colors">
                                        <div className={`w-1 h-8 rounded-full flex-shrink-0 ${getHistoryColor(item.eventType)}`}></div>
                                        <div className="flex-grow min-w-0">
                                            <div className="font-bold text-xs text-text line-clamp-1 leading-snug">{item.title}</div>
                                            <div className="text-[10px] text-muted flex justify-between items-center mt-0.5">
                                                <span>{formatEventType(item.eventType)}</span>
                                                <span>{formatRelativeAirDate(item.date)}</span>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
