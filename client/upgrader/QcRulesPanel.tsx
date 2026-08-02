import React from 'react';
import { portalUrl } from '../shared/basePath';
import type { ToastMessage } from '../shared/types';
import { QcPolicySummary } from './QcPolicySummary';
import { UpgraderExclusionsPanel } from './UpgraderExclusionsPanel';
import type { UpgraderStatus } from './types';

type Props = {
    status: UpgraderStatus | null;
    onToast: (message: string, type?: ToastMessage['type'] | 'info') => void;
    onChanged?: () => void;
};

export const QcRulesPanel: React.FC<Props> = ({ status, onToast, onChanged }) => {
    const activeByLibrary = Array.isArray(status?.activeDownloadsByLibrary)
        ? status!.activeDownloadsByLibrary!
        : [];
    const downloadCap = Math.max(1, Number(status?.maxDownloadsPerLibrary) || 5);

    return (
        <div className="space-y-6">
            <section className="rounded-2xl border border-border/60 bg-card/40 p-5">
                <QcPolicySummary status={status} />
            </section>

            <section className="rounded-2xl border border-border/60 bg-card/40 p-5 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <h2 className="text-sm font-bold uppercase tracking-wide text-muted">Live download pressure</h2>
                        <p className="text-xs text-muted mt-1">
                            Current Arr queue depth per library vs the hunt download cap ({downloadCap}).
                        </p>
                    </div>
                    <a
                        href={portalUrl('/upgrader?tab=downloads')}
                        className="text-xs font-bold text-plex no-underline hover:underline"
                    >
                        Downloads tab
                    </a>
                </div>
                {activeByLibrary.length === 0 ? (
                    <p className="text-xs text-muted">No active download counts available.</p>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                        {activeByLibrary.map((lib) => (
                            <div
                                key={lib.key}
                                className={`rounded-xl border px-3 py-2.5 ${
                                    lib.active >= lib.cap
                                        ? 'border-amber-500/30 bg-amber-500/10'
                                        : 'border-border/50 bg-background/40'
                                }`}
                            >
                                <div className="text-xs font-semibold text-text truncate">{lib.label}</div>
                                <div className="mt-1 text-sm font-bold text-text">
                                    {lib.active}/{lib.cap}
                                    <span className="ml-1 text-[11px] font-semibold text-muted">
                                        {lib.remaining} free
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </section>

            <section className="rounded-2xl border border-border/60 bg-card/40 p-5 space-y-2 text-xs">
                <h2 className="text-sm font-bold uppercase tracking-wide text-muted">Automation snapshot</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="rounded-xl border border-border/50 bg-background/40 px-3 py-3 space-y-1">
                        <p className="text-text">
                            Auto-hunt:{' '}
                            <span className="font-bold">{status?.automationEnabled ? 'On' : 'Off'}</span>
                        </p>
                        <p className="text-text">
                            Cleanup:{' '}
                            <span className="font-bold">{status?.cleanupAutomationEnabled ? 'On' : 'Off'}</span>
                        </p>
                        <p className="text-text">
                            Integrity:{' '}
                            <span className="font-bold">
                                {!status?.integrityEnabled
                                    ? 'Off'
                                    : status?.integrityAutomationEnabled
                                        ? 'Auto'
                                        : 'Manual'}
                            </span>
                        </p>
                    </div>
                    <div className="rounded-xl border border-border/50 bg-background/40 px-3 py-3 space-y-1">
                        <p className="text-text">
                            Clients: qBit {status?.clientsConfigured?.qbit ? '✓' : '—'}
                            {' · '}SAB {status?.clientsConfigured?.sab ? '✓' : '—'}
                        </p>
                        <p className="text-text">
                            Arr profile map:{' '}
                            <span className="font-bold">{status?.profileMapConfigured ? 'Configured' : 'Default'}</span>
                        </p>
                        <p className="text-muted">
                            Edit all of this in Settings → Quality Control.
                        </p>
                    </div>
                </div>
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
