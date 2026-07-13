import React from 'react';
import { MaintenanceRuleEditor } from './MaintenanceRuleEditor';
import { MaintenanceRuleList } from './MaintenanceRuleList';
import { MaintenanceRuleMatches } from './MaintenanceRuleMatches';
import { useLibraryMaintenanceRules } from './useLibraryMaintenanceRules';

type Props = {
    addToast: (message: string, type?: 'success' | 'error') => void;
    onRulesUpdated?: () => void;
};

export const LibraryMaintenancePanel: React.FC<Props> = ({ addToast, onRulesUpdated }) => {
    const maintenance = useLibraryMaintenanceRules({ addToast, onRulesUpdated });

    if (maintenance.loading) {
        return <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-plex border-t-transparent rounded-full animate-spin" /></div>;
    }

    return (
        <div className="mb-8 animate-fade-in space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-3">
                <div>
                    <h3 className="text-xl font-bold text-plex">Library Maintenance Rules</h3>
                    <p className="text-xs text-muted mt-1">Saved filters are listed below. Click one to edit, preview, and run.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <button type="button" className="px-2.5 py-1.5 text-xs bg-border text-text rounded-md font-semibold hover:bg-opacity-80" onClick={maintenance.rebuildIndex}>Rebuild Index</button>
                    <button type="button" className="px-2.5 py-1.5 text-xs bg-border text-text rounded-md font-semibold hover:bg-opacity-80" onClick={maintenance.addRule}>Add Filter</button>
                </div>
            </div>

            <div className="bg-background/30 border border-white/5 rounded-xl p-3 text-xs text-muted">
                Index: <span className="text-text font-semibold">{maintenance.indexInfo?.itemCount || 0}</span> media items
                {maintenance.indexInfo?.generatedAt ? <> · Last build: <span className="text-text">{new Date(maintenance.indexInfo.generatedAt).toLocaleString()}</span></> : null}
                {' '}· Request records: <span className="text-text font-semibold">{maintenance.indexInfo?.requestItemCount || 0}</span>
            </div>

            <MaintenanceRuleList
                rules={maintenance.rules}
                previews={maintenance.previewByRuleId}
                selectedRuleId={maintenance.selectedRuleId}
                saving={maintenance.saving}
                resettingRuleId={maintenance.resettingRuleId}
                togglingRuleId={maintenance.togglingRuleId}
                onDelete={maintenance.deleteRule}
                onEdit={maintenance.setSelectedRuleId}
                onPreview={maintenance.runPreview}
                onResetGrace={maintenance.resetRuleGraceTimer}
                onToggleEnabled={maintenance.toggleRuleEnabled}
            />

            {maintenance.selectedRule && (
                <MaintenanceRuleEditor
                    rule={maintenance.selectedRule}
                    fields={maintenance.fields}
                    dirty={maintenance.isRuleDirty(maintenance.selectedRule.id)}
                    saving={maintenance.saving}
                    previewing={maintenance.previewRuleId === maintenance.selectedRule.id}
                    running={maintenance.runningRuleId === maintenance.selectedRule.id}
                    pinCollectionOnDestructiveRun={maintenance.pinCollectionOnDestructiveRun}
                    onChange={maintenance.updateRule}
                    onClose={() => maintenance.setSelectedRuleId(null)}
                    onDelete={() => maintenance.deleteRule(maintenance.selectedRule?.id || '')}
                    onPinCollectionChange={maintenance.setPinCollectionOnDestructiveRun}
                    onPreview={() => maintenance.runPreview(maintenance.selectedRule?.id || '')}
                    onRun={(dryRun) => maintenance.runRule(maintenance.selectedRule?.id || '', dryRun)}
                    onSave={maintenance.saveRules}
                />
            )}

            <MaintenanceRuleMatches selectedRuleId={maintenance.selectedRuleId} preview={maintenance.selectedPreview} />
        </div>
    );
};
