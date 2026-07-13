import React from 'react';
import type { MaintenancePreview, MaintenanceRule } from './maintenanceRuleModels';

type Props = {
    rules: MaintenanceRule[];
    previews: Map<string, MaintenancePreview>;
    selectedRuleId: string | null;
    saving: boolean;
    resettingRuleId: string | null;
    togglingRuleId: string | null;
    onDelete: (ruleId: string) => void;
    onEdit: (ruleId: string) => void;
    onPreview: (ruleId: string) => void;
    onResetGrace: (ruleId: string) => void;
    onToggleEnabled: (ruleId: string) => void;
};

export const MaintenanceRuleList: React.FC<Props> = ({
    rules,
    previews,
    selectedRuleId,
    saving,
    resettingRuleId,
    togglingRuleId,
    onDelete,
    onEdit,
    onPreview,
    onResetGrace,
    onToggleEnabled
}) => (
    <div className="glass-card-sm p-4">
        <p className="text-xs text-muted uppercase tracking-wider font-bold mb-3">Saved Filters</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {rules.map((rule) => {
                const preview = previews.get(rule.id);
                return (
                    <div key={rule.id} className={`border rounded-lg p-3 transition-colors ${selectedRuleId === rule.id ? 'border-plex bg-plex/5' : 'border-white/5 bg-background/30'}`}>
                        <div className="flex items-start justify-between gap-2">
                            <div>
                                <p className="text-sm font-semibold text-text">{rule.name || 'Unnamed Rule'}</p>
                                <p className="text-xs text-muted mt-1">{(rule.filterTree?.conditions || []).length} condition(s)</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => onToggleEnabled(rule.id)}
                                disabled={togglingRuleId === rule.id}
                                className={`inline-flex items-center gap-2 px-2 py-1 rounded border text-[11px] font-semibold transition-colors disabled:opacity-60 ${rule.enabled !== false ? 'border-green-500/40 bg-green-500/10 text-green-300' : 'border-white/5 bg-background/30 text-muted'}`}
                                title="Toggle filter enabled/disabled"
                            >
                                <span className={`relative inline-flex h-3.5 w-7 rounded-full transition-colors ${rule.enabled !== false ? 'bg-green-500/40' : 'bg-border'}`}>
                                    <span className={`absolute top-0.5 h-2.5 w-2.5 rounded-full bg-white transition-transform ${rule.enabled !== false ? 'translate-x-4' : 'translate-x-0.5'}`} />
                                </span>
                                {togglingRuleId === rule.id ? 'Saving...' : (rule.enabled !== false ? 'Enabled' : 'Disabled')}
                            </button>
                        </div>
                        <p className="text-[11px] text-muted mt-2">Matches: {preview?.totalMatches ?? '—'}</p>
                        {(preview?.graceRemainingDays ?? 0) > 0 ? (
                            <p className="text-[11px] text-amber-300 mt-1">In grace: {preview?.graceRemainingDays} day(s) left</p>
                        ) : (
                            <p className="text-[11px] text-muted mt-1">
                                Eligible: {preview?.eligibleCount ?? '—'} · Sonarr/Radarr: {preview?.actionableCount ?? '—'} mapped
                                {(preview?.unactionableCount ?? 0) > 0 ? `, ${preview?.unactionableCount} unmapped` : ''}
                            </p>
                        )}
                        <p className="text-[11px] text-muted mt-1" title="Grace countdown starts when the rule is created.">
                            Grace: {Math.max(0, Number(rule.graceDays || 0))} day(s) {rule.createdAt ? `from ${new Date(rule.createdAt).toLocaleDateString()}` : 'from creation'}
                        </p>
                        <div className="flex gap-2 mt-3">
                            <button type="button" className="px-2.5 py-1.5 text-xs rounded border border-border text-text hover:border-plex/50" onClick={() => onEdit(rule.id)}>Edit</button>
                            <button type="button" className="px-2.5 py-1.5 text-xs rounded border border-border text-text hover:border-plex/50" onClick={() => onPreview(rule.id)}>Refresh</button>
                            <button
                                type="button"
                                className="px-2.5 py-1.5 text-xs rounded border border-amber-500/40 text-amber-300 hover:bg-amber-500/10 disabled:opacity-50"
                                title="Reset this rule's grace countdown to now."
                                onClick={() => onResetGrace(rule.id)}
                                disabled={saving || resettingRuleId === rule.id}
                            >
                                {resettingRuleId === rule.id ? 'Resetting...' : 'Reset'}
                            </button>
                            <button
                                type="button"
                                className="px-2.5 py-1.5 text-xs rounded border border-red-500/40 text-red-300 hover:bg-red-500/10 disabled:opacity-50"
                                onClick={() => onDelete(rule.id)}
                                disabled={saving}
                            >
                                Delete
                            </button>
                        </div>
                    </div>
                );
            })}
            {rules.length === 0 && <span className="text-sm text-muted">No filters yet. Click Add Filter.</span>}
        </div>
    </div>
);
