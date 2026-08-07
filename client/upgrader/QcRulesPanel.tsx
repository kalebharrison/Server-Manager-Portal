import React from 'react';
import type { ToastMessage } from '../shared/types';
import { SettingHint } from '../settings/SettingHint';
import { QcPolicySummary } from './QcPolicySummary';
import { UpgraderExclusionsPanel } from './UpgraderExclusionsPanel';
import type { UpgraderStatus } from './types';
import { QC_SECTION } from './qcUi';

type Props = {
    status: UpgraderStatus | null;
    onToast: (message: string, type?: ToastMessage['type'] | 'info') => void;
    onChanged?: () => void;
};

/** Full policy + skip list. Live pressure / automation live on Overview. */
export const QcRulesPanel: React.FC<Props> = ({ status, onToast, onChanged }) => (
    <div className="space-y-6">
        <section className={QC_SECTION}>
            <QcPolicySummary status={status} />
        </section>

        <div className="space-y-4">
            <div>
                <h2 className="text-sm font-bold uppercase tracking-wide text-muted inline-flex items-center flex-wrap gap-x-1">
                    Skip list
                    <SettingHint>
                        Titles here are never hunted for upgrades. Cleanup and integrity still apply.
                    </SettingHint>
                </h2>
                <p className="text-xs text-muted mt-1">
                    Excluded titles skip auto-hunt only.
                </p>
            </div>
            <UpgraderExclusionsPanel
                addToast={(message, type) => onToast(message, type)}
                onChanged={onChanged}
            />
        </div>
    </div>
);

export { UpgraderExclusionsPanel };
