import React from 'react';

export const MaintenanceCollectionsSection: React.FC<{
    addToast: (message: string, type?: 'success' | 'error') => void;
    rules: any[];
    saveAllRules: (nextRules: any[]) => Promise<void>;
    setRules: (rules: any[]) => void;
}> = ({ addToast, rules, saveAllRules, setRules }) => (
    <div className="glass-card-sm p-5 space-y-3">
        <h3 className="text-xl font-bold text-plex">Collections</h3>
        <p className="text-sm text-muted">Manage collection behavior per rule. Changes save directly to each ruleset.</p>
        <div className="space-y-2">
            {rules.map((rule: any) => (
                <div key={`collection-${rule.id}`} className="bg-background/30 border border-white/5 rounded-lg p-3">
                    <div className="flex items-center justify-between gap-3">
                        <p className="font-semibold text-text text-sm">{rule.name || 'Unnamed Rule'}</p>
                        <label className="text-xs text-muted flex items-center gap-2">
                            <input
                                type="checkbox"
                                checked={rule?.collection?.enabled !== false}
                                onChange={async (e) => {
                                    const next = rules.map((r: any) => r.id === rule.id ? { ...r, collection: { ...(r.collection || {}), enabled: e.target.checked } } : r);
                                    setRules(next);
                                    await saveAllRules(next);
                                    addToast('Collection settings updated.');
                                }}
                            />
                            Enabled
                        </label>
                    </div>
                    <input
                        className="mt-2 w-full p-2 rounded border border-border bg-card text-text text-sm"
                        value={rule?.collection?.nameTemplate || 'Leaving Soon - {{ruleName}}'}
                        onChange={(e) => {
                            const next = rules.map((r: any) => r.id === rule.id ? { ...r, collection: { ...(r.collection || {}), nameTemplate: e.target.value } } : r);
                            setRules(next);
                        }}
                        onBlur={async (e) => {
                            const next = rules.map((r: any) => r.id === rule.id
                                ? { ...r, collection: { ...(r.collection || {}), nameTemplate: e.target.value } }
                                : r);
                            setRules(next);
                            await saveAllRules(next);
                            addToast('Collection template saved.');
                        }}
                    />
                </div>
            ))}
        </div>
    </div>
);
