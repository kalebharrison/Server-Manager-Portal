import React from 'react';
import { Settings as SettingsIcon } from 'lucide-react';
import { portalUrl } from '../shared/basePath';
import type { ToastMessage } from '../shared/types';
import { UpgraderExclusionsPanel } from './UpgraderExclusionsPanel';
import type { UpgraderStatus } from './types';

type Props = {
    status: UpgraderStatus | null;
    onToast: (message: string, type?: ToastMessage['type'] | 'info') => void;
    onChanged?: () => void;
};

export const QcRulesPanel: React.FC<Props> = ({ status, onToast, onChanged }) => {
    const thresholds = status?.qcThresholds;

    return (
        <div className="space-y-6">
            <section className="rounded-2xl border border-border/60 bg-card/40 p-5 space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <h2 className="text-sm font-bold uppercase tracking-wide text-muted">Cleanup thresholds</h2>
                        <p className="text-xs text-muted mt-1">
                            Read-only reminder of current Quality Control thresholds. Edit them in Settings.
                        </p>
                    </div>
                    <a
                        href={portalUrl('/settings#upgrader')}
                        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border text-xs font-bold text-text no-underline hover:border-plex/40"
                    >
                        <SettingsIcon className="w-3.5 h-3.5" />
                        Open Settings
                    </a>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                    <div className="rounded-xl border border-border/50 bg-background/40 px-3 py-3">
                        <div className="text-[11px] uppercase tracking-wide text-muted">MetaDL</div>
                        <div className="mt-1 text-lg font-bold text-text">{thresholds?.metaDlMinutes ?? 30}m</div>
                    </div>
                    <div className="rounded-xl border border-border/50 bg-background/40 px-3 py-3">
                        <div className="text-[11px] uppercase tracking-wide text-muted">Stalled</div>
                        <div className="mt-1 text-lg font-bold text-text">{thresholds?.stalledHours ?? 6}h</div>
                    </div>
                    <div className="rounded-xl border border-border/50 bg-background/40 px-3 py-3">
                        <div className="text-[11px] uppercase tracking-wide text-muted">Not importing</div>
                        <div className="mt-1 text-lg font-bold text-text">{thresholds?.completedNotImportingMinutes ?? 60}m</div>
                    </div>
                    <div className="rounded-xl border border-border/50 bg-background/40 px-3 py-3">
                        <div className="text-[11px] uppercase tracking-wide text-muted">Research throttle</div>
                        <div className="mt-1 text-lg font-bold text-text">{thresholds?.researchThrottleHours ?? 24}h</div>
                    </div>
                    <div className="rounded-xl border border-border/50 bg-background/40 px-3 py-3">
                        <div className="text-[11px] uppercase tracking-wide text-muted">Snooze default</div>
                        <div className="mt-1 text-lg font-bold text-text">{thresholds?.snoozeDefaultHours ?? 24}h</div>
                    </div>
                </div>
                <p className="text-xs text-muted">
                    Cleanup automation: {status?.cleanupAutomationEnabled ? 'On' : 'Off'}
                    {' · '}Clients: qBit {status?.clientsConfigured?.qbit ? '✓' : '—'}, SAB {status?.clientsConfigured?.sab ? '✓' : '—'}
                    {' · '}Change thresholds in Settings → Quality Control.
                </p>
            </section>

            <section className="space-y-3">
                <h2 className="text-sm font-bold uppercase tracking-wide text-muted">Skip list</h2>
                <UpgraderExclusionsPanel
                    addToast={(message, type) => onToast(message, type)}
                    onChanged={onChanged}
                />
            </section>
        </div>
    );
};

export { UpgraderExclusionsPanel };
