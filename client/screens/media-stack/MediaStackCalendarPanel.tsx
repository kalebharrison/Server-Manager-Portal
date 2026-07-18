import React from 'react';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';

import { CalendarReleaseItem } from './CalendarReleaseItem';
import type { MediaStackDashboardState } from './useMediaStackDashboard';
import { ymd } from './useMediaStackDashboard';

const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const MediaStackCalendarPanel: React.FC<MediaStackDashboardState> = ({
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
}) => (
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
                            onClick={() => handleCalendarFilterChange(option.id)}
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
                            onClick={() => handleCalendarViewChange(option.id)}
                            className={`px-3 py-1.5 rounded-md text-[11px] font-bold uppercase tracking-wider transition-colors ${calendarView === option.id ? 'bg-plex text-background' : 'text-muted hover:text-text hover:bg-white/5'}`}
                        >
                            {option.label}
                        </button>
                    ))}
                </div>
                {calendarView === 'month' ? <div className="flex bg-white/5 p-1 rounded-xl border border-white/10 w-fit flex-shrink-0 items-center gap-2">
                    <button type="button" onClick={() => handleMonthOffsetChange(-1)} className="p-1.5 hover:bg-white/10 rounded-lg text-muted hover:text-text transition-colors">
                        <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span className="text-xs font-bold px-2 w-28 text-center text-text uppercase tracking-wider">
                        {displayMonth.toLocaleDateString('default', { month: 'short', year: 'numeric' })}
                    </span>
                    <button type="button" onClick={() => handleMonthOffsetChange(1)} className="p-1.5 hover:bg-white/10 rounded-lg text-muted hover:text-text transition-colors">
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
                            {items.map((item) => <CalendarReleaseItem key={item.id} item={item} />)}
                        </div>
                    </section>
                ))}
            </div>
        )}
    </div>
);
