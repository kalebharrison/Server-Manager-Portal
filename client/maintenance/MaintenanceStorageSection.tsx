import React from 'react';

import { formatReclaimSizeFromGB } from './maintenanceDashboardUtils';

export const MaintenanceStorageSection: React.FC<{
    candidateRuleId: string;
    loadStorageSummary: (ruleId?: string) => void;
    selectedCandidateRule: any;
    storageSummary: any;
    storageSummaryLoading: boolean;
}> = ({ candidateRuleId, loadStorageSummary, selectedCandidateRule, storageSummary, storageSummaryLoading }) => (
    <div className="glass-card-sm p-5 space-y-4">
        <h3 className="text-xl font-bold text-plex">Storage Metrics</h3>
        <p className="text-sm text-muted">Deep storage projection per library based on indexed size and current rule matches.</p>
        <div className="flex items-center gap-2">
            <button
                type="button"
                className="px-3 py-1.5 bg-border text-text rounded-md text-xs font-semibold hover:bg-opacity-80"
                onClick={() => loadStorageSummary(candidateRuleId || undefined)}
            >
                {storageSummaryLoading ? 'Refreshing...' : 'Refresh Summary'}
            </button>
            {selectedCandidateRule && (
                <p className="text-xs text-muted">Rule scope: <span className="text-text font-semibold">{selectedCandidateRule.name || 'Unnamed Rule'}</span></p>
            )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="bg-background/30 border border-white/5 rounded-lg p-3">
                <p className="text-xs text-muted">Library Size Before</p>
                <p className="text-2xl font-bold text-text">{formatReclaimSizeFromGB(Number(storageSummary?.totals?.beforeGB || 0))}</p>
            </div>
            <div className="bg-background/30 border border-white/5 rounded-lg p-3">
                <p className="text-xs text-muted">Projected Reclaim</p>
                <p className="text-2xl font-bold text-text">{formatReclaimSizeFromGB(Number(storageSummary?.totals?.reclaimGB || 0))}</p>
            </div>
            <div className="bg-background/30 border border-white/5 rounded-lg p-3">
                <p className="text-xs text-muted">Projected Size After</p>
                <p className="text-2xl font-bold text-text">{formatReclaimSizeFromGB(Number(storageSummary?.totals?.afterGB || 0))}</p>
            </div>
            <div className="bg-background/30 border border-white/5 rounded-lg p-3">
                <p className="text-xs text-muted">Reclaim Percent</p>
                <p className="text-2xl font-bold text-text">{Number(storageSummary?.totals?.reclaimPercent || 0).toFixed(1)}%</p>
            </div>
        </div>
        <div className="bg-background/30 border border-white/5 rounded-lg p-3">
            <div className="grid grid-cols-[minmax(0,2fr)_1fr_1fr_1fr_1fr] gap-2 px-2 py-1 text-[11px] uppercase tracking-wider text-muted font-bold border-b border-border">
                <span>Library</span>
                <span className="text-right">Before</span>
                <span className="text-right">Reclaim</span>
                <span className="text-right">After</span>
                <span className="text-right">Matched</span>
            </div>
            <div className="max-h-[420px] overflow-y-auto custom-scrollbar pr-1 space-y-1 mt-2">
                {(storageSummary?.libraries || []).map((row: any) => (
                    <div key={`storage-row-${row.libraryTitle}`} className="grid grid-cols-[minmax(0,2fr)_1fr_1fr_1fr_1fr] gap-2 px-2 py-2 text-sm bg-background/30 border border-white/5 rounded-lg items-center">
                        <span className="text-text line-clamp-1">{row.libraryTitle}</span>
                        <span className="text-muted text-right">{formatReclaimSizeFromGB(Number(row.totalSizeGB || 0))}</span>
                        <span className="text-right text-plex font-semibold">{formatReclaimSizeFromGB(Number(row.reclaimGB || 0))}</span>
                        <span className="text-muted text-right">{formatReclaimSizeFromGB(Number(row.afterSizeGB || 0))}</span>
                        <span className="text-muted text-right">{row.matchedItems || 0}</span>
                    </div>
                ))}
                {!storageSummaryLoading && !(storageSummary?.libraries || []).length && (
                    <p className="text-sm text-muted px-2 py-2">No storage summary yet. Refresh or load candidates/rules first.</p>
                )}
                {storageSummaryLoading && <p className="text-sm text-muted px-2 py-2">Loading storage summary...</p>}
            </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="bg-background/30 border border-white/5 rounded-lg p-3">
                <p className="text-xs text-muted">Total Indexed Items</p>
                <p className="text-xl font-bold text-text">{Number(storageSummary?.totals?.items || 0)}</p>
            </div>
            <div className="bg-background/30 border border-white/5 rounded-lg p-3">
                <p className="text-xs text-muted">Matched Candidate Items</p>
                <p className="text-xl font-bold text-text">{Number(storageSummary?.totals?.matchedItems || 0)}</p>
            </div>
            <div className="bg-background/30 border border-white/5 rounded-lg p-3">
                <p className="text-xs text-muted">Libraries Covered</p>
                <p className="text-xl font-bold text-text">{Number(storageSummary?.totals?.libraries || 0)}</p>
            </div>
        </div>
        {storageSummary?.rulesConsidered?.length > 0 && (
            <div className="bg-background/30 border border-white/5 rounded-lg p-3">
                <p className="text-xs text-muted font-bold uppercase tracking-wider mb-2">Rules Included</p>
                <div className="flex flex-wrap gap-1.5">
                    {storageSummary.rulesConsidered.map((rule: any) => (
                        <span key={`storage-rule-${rule.id}`} className="px-2 py-1 rounded bg-border text-xs text-text">{rule.name || 'Unnamed Rule'}</span>
                    ))}
                </div>
            </div>
        )}
    </div>
);
