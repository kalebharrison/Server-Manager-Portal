import React from 'react';

import { portalUrl } from '../shared/basePath';

export const MaintenanceCandidatesSection: React.FC<{
    rules: any[];
    candidateRuleId: string;
    candidateSearch: string;
    filteredCandidates: any[];
    isLoadingCandidates: boolean;
    selectedCandidateRule: any;
    setCandidateRuleId: (ruleId: string) => void;
    setCandidateSearch: (value: string) => void;
}> = ({
    rules,
    candidateRuleId,
    candidateSearch,
    filteredCandidates,
    isLoadingCandidates,
    selectedCandidateRule,
    setCandidateRuleId,
    setCandidateSearch
}) => (
    <div className="glass-card-sm p-3 md:p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-xl font-bold text-plex">Candidates</h3>
            <div className="flex items-center gap-2">
                <input
                    className="p-2 rounded border border-border bg-card text-text text-sm"
                    placeholder="Search titles..."
                    value={candidateSearch}
                    onChange={(e) => setCandidateSearch(e.target.value)}
                />
            </div>
        </div>
        <div className="flex flex-wrap gap-2">
            {rules.map((rule: any) => (
                <button
                    key={`candidate-rule-tab-${rule.id}`}
                    type="button"
                    onClick={() => setCandidateRuleId(rule.id)}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-md border transition-colors ${candidateRuleId === rule.id ? 'bg-plex text-background border-plex' : 'bg-background/30 text-text border-white/5 hover:border-plex/40'}`}
                >
                    {rule.name || 'Unnamed Rule'}
                </button>
            ))}
            {!rules.length && <p className="text-sm text-muted">No saved rules found. Create a rule in `Rules` first.</p>}
        </div>
        {selectedCandidateRule && (
            <p className="text-xs text-muted">
                Showing candidates for <span className="text-text font-semibold">{selectedCandidateRule.name || 'Unnamed Rule'}</span> only.
            </p>
        )}
        {isLoadingCandidates ? <p className="text-sm text-muted">Loading candidates...</p> : (
            <div className="grid grid-cols-3 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-7 gap-2 md:gap-3 max-h-[620px] overflow-y-auto custom-scrollbar pr-1">
                {filteredCandidates.map((item: any) => (
                    <div key={`candidate-${item._ruleId || candidateRuleId}-${item.ratingKey}`} className="bg-background/30 border border-white/5 rounded-lg overflow-hidden">
                        <div className="aspect-[2/3] bg-black/40">
                            {item.thumb ? (
                                <img src={portalUrl(`/api/plex/image?path=${encodeURIComponent(item.thumb)}&width=220&height=330`)} alt={item.title} loading="lazy" className="w-full h-full object-cover" />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center text-xs text-muted">No Poster</div>
                            )}
                        </div>
                        <div className="p-2">
                            <p className="text-xs text-text line-clamp-2">{item.title}</p>
                            <p className="text-[11px] text-muted mt-1">{item.libraryTitle || 'Unknown Library'}</p>
                        </div>
                    </div>
                ))}
                {!filteredCandidates.length && <p className="text-sm text-muted col-span-full">No matching candidates found for this ruleset.</p>}
            </div>
        )}
    </div>
);
