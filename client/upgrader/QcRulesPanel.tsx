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

/** Live cleanup cheat sheet + skip/snooze list. Strike numbers stay in Settings. */
export const QcRulesPanel: React.FC<Props> = ({ status, onToast, onChanged }) => (
    <div className="space-y-4">
        <section className={QC_SECTION}>
            <QcPolicySummary status={status} />
        </section>

        <section className={`${QC_SECTION} space-y-3`}>
            <div>
                <h2 className="text-sm font-bold uppercase tracking-wide text-muted inline-flex items-center flex-wrap gap-x-1">
                    Skip & snooze
                    <SettingHint>
                        Title skips never auto-hunt. Hunt snoozes hide a title for a while.
                        Download snoozes skip cleanup for one queue row. Integrity still applies.
                    </SettingHint>
                </h2>
                <p className="text-xs text-muted mt-1">
                    This is the only list you edit here. Strike timers and hunt caps live in Settings.
                </p>
            </div>
            <UpgraderExclusionsPanel
                addToast={(message, type) => onToast(message, type)}
                onChanged={onChanged}
                embedded
            />
        </section>
    </div>
);

export { UpgraderExclusionsPanel };
