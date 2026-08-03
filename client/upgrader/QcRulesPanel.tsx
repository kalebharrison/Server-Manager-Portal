import React from 'react';
import type { ToastMessage } from '../shared/types';
import { QcPolicySummary } from './QcPolicySummary';
import { UpgraderExclusionsPanel } from './UpgraderExclusionsPanel';
import type { UpgraderStatus } from './types';

type Props = {
    status: UpgraderStatus | null;
    onToast: (message: string, type?: ToastMessage['type'] | 'info') => void;
    onChanged?: () => void;
};

/** Full policy + skip list. Live pressure / automation live on Overview. */
export const QcRulesPanel: React.FC<Props> = ({ status, onToast, onChanged }) => (
    <div className="space-y-6">
        <section className="rounded-2xl border border-border/60 bg-card/40 p-5">
            <QcPolicySummary status={status} />
        </section>

        <section className="space-y-3">
            <div>
                <h2 className="text-sm font-bold uppercase tracking-wide text-muted">Skip list</h2>
                <p className="text-xs text-muted mt-1">
                    Titles here are never hunted for upgrades. Cleanup and integrity still apply.
                </p>
            </div>
            <UpgraderExclusionsPanel
                addToast={(message, type) => onToast(message, type)}
                onChanged={onChanged}
            />
        </section>
    </div>
);

export { UpgraderExclusionsPanel };
