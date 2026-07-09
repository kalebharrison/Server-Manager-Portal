import React from 'react';

import { portalUrl } from '../shared/basePath';
import {
    ELIGIBLE_NOW_KEY,
    formatReclaimSizeFromGB,
    getEligibilityTooltip
} from './maintenanceDashboardUtils';

export const MaintenanceCalendarSection: React.FC<{
    calendarEligibility: any;
    candidateRuleId: string;
    rules: any[];
    selectedCalendarGroup: any;
    selectedCandidateRule: any;
    setCandidateRuleId: (ruleId: string) => void;
    setSelectedCalendarDate: (date: string | null) => void;
}> = ({
    calendarEligibility,
    candidateRuleId,
    rules,
    selectedCalendarGroup,
    selectedCandidateRule,
    setCandidateRuleId,
    setSelectedCalendarDate
}) => (
    <>
        <div className="glass-card-sm p-5 space-y-3">
            <h3 className="text-xl font-bold text-plex">Calendar</h3>
            <p className="text-sm text-muted">Rule-based eligibility schedule. Grace days are applied from this rule's creation date.</p>
            <div className="flex flex-wrap gap-2">
                {rules.map((rule: any) => (
                    <button
                        key={`calendar-rule-tab-${rule.id}`}
                        type="button"
                        onClick={() => setCandidateRuleId(rule.id)}
                        className={`px-3 py-1.5 text-xs font-semibold rounded-md border transition-colors ${candidateRuleId === rule.id ? 'bg-plex text-background border-plex' : 'bg-background/30 text-text border-white/5 hover:border-plex/40'}`}
                    >
                        {rule.name || 'Unnamed Rule'}
                    </button>
                ))}
            </div>
            {selectedCandidateRule && (
                <p className="text-xs text-muted">
                    Current rule: <span className="text-text font-semibold">{selectedCandidateRule.name || 'Unnamed Rule'}</span> · Grace Days: <span className="text-text font-semibold">{calendarEligibility.graceDays}</span> · Rule Age: <span className="text-text font-semibold">{calendarEligibility.daysSinceRuleCreated}</span> day(s)
                </p>
            )}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <button
                    type="button"
                    onClick={() => setSelectedCalendarDate(ELIGIBLE_NOW_KEY)}
                    className="text-left bg-background/30 border border-white/5 rounded-lg p-3 hover:border-plex/50 transition-colors"
                    title="Titles that match this rule and whose grace window has elapsed."
                >
                    <p className="text-xs text-muted">Eligible Now</p>
                    <p className="text-2xl font-bold text-text mt-1">{calendarEligibility.eligibleNow.length}</p>
                    <p className="text-[11px] text-muted mt-1">{formatReclaimSizeFromGB(calendarEligibility.eligibleNow.reduce((sum: number, item: any) => sum + Number(item.sizeGB || 0), 0))} reclaim now</p>
                </button>
                <div className="bg-background/30 border border-white/5 rounded-lg p-3" title="Number of future dates with delayed eligibility while this rule's grace period is active.">
                    <p className="text-xs text-muted">Eligible Later Days</p>
                    <p className="text-2xl font-bold text-text mt-1">{calendarEligibility.eligibleLaterByDay.length}</p>
                </div>
                <div className="bg-background/30 border border-white/5 rounded-lg p-3" title="Titles currently matching this rule but still waiting for grace to expire.">
                    <p className="text-xs text-muted">Later Titles</p>
                    <p className="text-2xl font-bold text-text mt-1">{calendarEligibility.eligibleLaterByDay.reduce((sum: number, day: any) => sum + Number(day.count || 0), 0)}</p>
                </div>
                <div className="bg-background/30 border border-white/5 rounded-lg p-3" title="Reclaim estimate from matches that are delayed by active grace days.">
                    <p className="text-xs text-muted">Later Reclaim</p>
                    <p className="text-2xl font-bold text-text mt-1">{formatReclaimSizeFromGB(calendarEligibility.eligibleLaterByDay.reduce((sum: number, day: any) => sum + Number(day.reclaimGB || 0), 0))}</p>
                </div>
            </div>
            <div className="space-y-2">
                <p className="text-xs uppercase tracking-wider text-muted font-bold" title="Dates when currently matched titles become eligible once this rule's grace period expires.">Eligible Later by Date</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 max-h-[700px] overflow-y-auto custom-scrollbar pr-1">
                {calendarEligibility.eligibleLaterByDay.slice(0, 120).map((day: any) => {
                    const dateLabel = new Date(`${day.date}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
                    return (
                        <button
                            key={`calendar-day-${day.date}`}
                            type="button"
                            onClick={() => setSelectedCalendarDate(day.date)}
                            className="text-left bg-background/30 border border-white/5 rounded-lg p-3 hover:border-plex/50 hover:bg-black/30 transition-colors"
                        >
                            <div className="flex items-center justify-between gap-2">
                                <p className="text-sm font-semibold text-text">{dateLabel}</p>
                                <span className="text-[11px] px-2 py-0.5 rounded bg-plex/20 text-plex font-semibold" title="Number of titles becoming eligible on this date.">{day.count}</span>
                            </div>
                            <p className="text-[11px] text-muted mt-1">{day.minDaysUntil} day(s) until eligible · {formatReclaimSizeFromGB(day.reclaimGB)} reclaim</p>
                            <div className="mt-2 flex -space-x-2">
                                {day.preview.map((item: any, idx: number) => (
                                    <div key={`calendar-preview-${day.date}-${item.ratingKey}-${idx}`} className="w-8 h-8 rounded-full overflow-hidden border border-white/5 bg-black/50" title={`${item.title || 'Unknown Title'} • ${getEligibilityTooltip(item)}`}>
                                        {item.thumb ? (
                                            <img
                                                src={portalUrl(`/api/plex/image?path=${encodeURIComponent(item.thumb)}&width=64&height=64`)}
                                                alt={item.title}
                                                className="w-full h-full object-cover"
                                                loading="lazy"
                                            />
                                        ) : (
                                            <div className="w-full h-full" />
                                        )}
                                    </div>
                                ))}
                            </div>
                        </button>
                    );
                })}
                {!calendarEligibility.eligibleLaterByDay.length && <p className="text-sm text-muted col-span-full">No delayed dates. Current matches are eligible now.</p>}
            </div>
        </div>
        {selectedCalendarGroup && (
            <div className="fixed inset-0 z-[1500] bg-black/70 backdrop-blur-[1px] flex items-center justify-center p-3 md:p-6" onClick={() => setSelectedCalendarDate(null)}>
                <div className="w-full max-w-6xl max-h-[86vh] bg-card/80 backdrop-blur-md border border-white/5 rounded-xl shadow-2xl p-4 md:p-5 overflow-y-auto custom-scrollbar" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-start justify-between gap-3 mb-3">
                        <div>
                            <h4 className="text-xl font-bold text-plex">
                                {selectedCalendarGroup.title || new Date(`${selectedCalendarGroup.date}T00:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                            </h4>
                            <p className="text-sm text-muted mt-1" title={selectedCalendarGroup.date === ELIGIBLE_NOW_KEY ? 'These titles currently match this rule and are eligible now.' : 'These titles match this rule but are waiting for the grace period to elapse.'}>
                                {selectedCalendarGroup.count} title(s) · {formatReclaimSizeFromGB(selectedCalendarGroup.reclaimGB)} reclaim
                            </p>
                        </div>
                        <button
                            type="button"
                            className="px-3 py-1.5 bg-border text-text rounded-md text-sm font-semibold hover:bg-opacity-80"
                            onClick={() => setSelectedCalendarDate(null)}
                        >
                            Close
                        </button>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-7 gap-3">
                        {selectedCalendarGroup.items.map((item: any, idx: number) => (
                            <div key={`calendar-modal-item-${selectedCalendarGroup.date}-${item.ratingKey}-${idx}`} className="bg-background/30 border border-white/5 rounded-lg overflow-hidden" title={getEligibilityTooltip(item)}>
                                <div className="aspect-[2/3] bg-black/40">
                                    {item.thumb ? (
                                        <img
                                            src={portalUrl(`/api/plex/image?path=${encodeURIComponent(item.thumb)}&width=240&height=360`)}
                                            alt={item.title}
                                            loading="lazy"
                                            className="w-full h-full object-cover"
                                        />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-xs text-muted">No Poster</div>
                                    )}
                                </div>
                                <div className="p-2">
                                    <p className="text-xs text-text line-clamp-2">{item.title}</p>
                                    <p className="text-[11px] text-muted mt-1">{item.libraryTitle || 'Unknown Library'}</p>
                                    <p className="text-[11px] text-muted mt-1" title="Eligibility detail used by the backend.">
                                        Last watch: {Number.isFinite(Number(item.daysSinceLastWatch)) ? `${Number(item.daysSinceLastWatch)}d ago` : 'n/a'} · Added: {Number.isFinite(Number(item.daysSinceAdded)) ? `${Number(item.daysSinceAdded)}d ago` : 'n/a'}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        )}
    </>
);
