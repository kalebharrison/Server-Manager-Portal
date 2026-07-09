import React from 'react';

export const MaintenanceRuleLibrarySection: React.FC<{
    addToast: (message: string, type?: 'success' | 'error') => void;
    libraryJsonInput: string;
    rules: any[];
    saveAllRules: (nextRules: any[]) => Promise<void>;
    setLibraryJsonInput: (value: string) => void;
}> = ({ addToast, libraryJsonInput, rules, saveAllRules, setLibraryJsonInput }) => (
    <div className="glass-card-sm p-5 space-y-3">
        <h3 className="text-xl font-bold text-plex">Rule Library</h3>
        <div className="flex flex-wrap gap-2">
            <button
                type="button"
                className="px-3 py-2 bg-border text-text rounded-md text-sm font-semibold"
                onClick={() => {
                    const blob = new Blob([JSON.stringify(rules, null, 2)], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `maintenance-rules-${Date.now()}.json`;
                    a.click();
                    URL.revokeObjectURL(url);
                    addToast('Rule export downloaded.');
                }}
            >
                Export Rules JSON
            </button>
            <button
                type="button"
                className="px-3 py-2 bg-plex text-background rounded-md text-sm font-semibold"
                onClick={async () => {
                    try {
                        const parsed = JSON.parse(libraryJsonInput || '[]');
                        if (!Array.isArray(parsed)) throw new Error('JSON must be an array of rules.');
                        await saveAllRules(parsed);
                        addToast('Imported rules saved.');
                    } catch (e: any) {
                        addToast(e.message || 'Invalid JSON import.', 'error');
                    }
                }}
            >
                Import Rules JSON
            </button>
        </div>
        <textarea
            className="w-full min-h-[240px] p-3 rounded-lg border border-border bg-card text-text text-xs font-mono"
            placeholder="Paste exported rules JSON here to import."
            value={libraryJsonInput}
            onChange={(e) => setLibraryJsonInput(e.target.value)}
        />
    </div>
);
