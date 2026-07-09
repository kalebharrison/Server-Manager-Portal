import React from 'react';

import { formatReclaimSizeFromGB } from './maintenanceDashboardUtils';

export const MaintenanceOverviewSection: React.FC<{
    overview: any;
    overviewInsights: any;
    previewGroups: any[];
    runs: any[];
}> = ({ overview, overviewInsights, previewGroups, runs }) => (
    <div className="space-y-4">
        <div className="glass-card-sm p-5">
            <h3 className="text-xl font-bold text-plex mb-2">Cleaner Control Center</h3>
            <p className="text-sm text-muted mb-4">Dedicated module for library maintenance automation: rules, collections, candidates, execution timeline, calendar, storage, and governance.</p>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="bg-background/30 rounded-lg p-3 border border-white/5">
                    <p className="text-xs text-muted">Indexed Media</p>
                    <p className="text-2xl font-bold text-text">{overview?.itemCount || 0}</p>
                </div>
                <div className="bg-background/30 rounded-lg p-3 border border-white/5">
                    <p className="text-xs text-muted">Request Records</p>
                    <p className="text-2xl font-bold text-text">{overview?.requestItemCount || 0}</p>
                </div>
                <div className="bg-background/30 rounded-lg p-3 border border-white/5">
                    <p className="text-xs text-muted">Rules with Matches</p>
                    <p className="text-2xl font-bold text-text">{previewGroups.filter((p: any) => (p.totalMatches || 0) > 0).length}</p>
                </div>
                <div className="bg-background/30 rounded-lg p-3 border border-white/5">
                    <p className="text-xs text-muted">Total Runs</p>
                    <p className="text-2xl font-bold text-text">{runs.length}</p>
                </div>
            </div>
        </div>
        <div className="glass-card-sm p-5 space-y-4">
            <h4 className="font-bold text-text">Reclaim & Impact Overview</h4>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="bg-background/30 rounded-lg p-3 border border-white/5">
                    <p className="text-xs text-muted">Total Matched (Rules Combined)</p>
                    <p className="text-2xl font-bold text-text">{overviewInsights.totalMatches}</p>
                </div>
                <div className="bg-background/30 rounded-lg p-3 border border-white/5">
                    <p className="text-xs text-muted">Unique Candidate Titles</p>
                    <p className="text-2xl font-bold text-text">{overviewInsights.uniqueMatches}</p>
                </div>
                <div className="bg-background/30 rounded-lg p-3 border border-white/5">
                    <p className="text-xs text-muted">Estimated Reclaim</p>
                    <p className="text-2xl font-bold text-text">{formatReclaimSizeFromGB(overviewInsights.estimatedReclaimGB)}</p>
                </div>
                <div className="bg-background/30 rounded-lg p-3 border border-white/5">
                    <p className="text-xs text-muted">Top Impact Library</p>
                    <p className="text-sm font-bold text-text line-clamp-2">{overviewInsights.libraries[0]?.libraryTitle || '—'}</p>
                    <p className="text-xs text-muted mt-1">{overviewInsights.libraries[0] ? formatReclaimSizeFromGB(overviewInsights.libraries[0].reclaimGB) : 'No data'}</p>
                </div>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                <div className="bg-background/30 rounded-lg p-3 border border-white/5">
                    <p className="text-xs text-muted font-bold uppercase tracking-wider mb-2">Top Libraries by Reclaim</p>
                    <div className="space-y-1.5 max-h-52 overflow-y-auto custom-scrollbar pr-1">
                        {overviewInsights.libraries.slice(0, 8).map((lib: any) => (
                            <div key={`overview-lib-${lib.libraryTitle}`} className="flex items-center justify-between text-xs bg-background/30 border border-white/5 rounded px-2 py-1.5">
                                <span className="text-text line-clamp-1">{lib.libraryTitle}</span>
                                <span className="text-muted ml-2 whitespace-nowrap">{formatReclaimSizeFromGB(lib.reclaimGB)} · {lib.count}</span>
                            </div>
                        ))}
                        {!overviewInsights.libraries.length && <p className="text-xs text-muted">No matching candidates yet.</p>}
                    </div>
                </div>
                <div className="bg-background/30 rounded-lg p-3 border border-white/5">
                    <p className="text-xs text-muted font-bold uppercase tracking-wider mb-2">Top Rules by Reclaim</p>
                    <div className="space-y-1.5 max-h-52 overflow-y-auto custom-scrollbar pr-1">
                        {overviewInsights.rules.slice(0, 8).map((rule: any) => (
                            <div key={`overview-rule-${rule.ruleId}`} className="flex items-center justify-between text-xs bg-background/30 border border-white/5 rounded px-2 py-1.5">
                                <span className="text-text line-clamp-1">{rule.ruleName}</span>
                                <span className="text-muted ml-2 whitespace-nowrap">{formatReclaimSizeFromGB(rule.reclaimGB)} · {rule.totalMatches}</span>
                            </div>
                        ))}
                        {!overviewInsights.rules.length && <p className="text-xs text-muted">No rules with match data yet.</p>}
                    </div>
                </div>
            </div>
        </div>
    </div>
);
