import React, { useEffect, useRef } from 'react';

import { Loader, ToastContainer, type ToastMessage } from '../shared/toast';
import { SettingsNavigation } from './SettingsNavigation';
import { SettingsTabPanel, type SettingsTabPanelProps } from './SettingsTabPanel';
import { getSettingsTabMeta, type SettingsTab, type SettingsTabGroup, type SettingsTabId } from './settingsTabs';

const ACTION_ONLY_TABS = new Set<SettingsTabId>(['broadcast', 'invites', 'tasks', 'logs']);
const SAVE_LABELS: Partial<Record<SettingsTabId, string>> = {
    status: 'Save Status Page',
    'stream-rules': 'Save Stream Policies',
};

type SettingsPageLayoutProps = {
    activeTab: SettingsTabId;
    isLoading: boolean;
    configLoadError: string | null;
    toasts: ToastMessage[];
    setToasts: React.Dispatch<React.SetStateAction<ToastMessage[]>>;
    settingsSearch: string;
    settingsTabs: SettingsTab[];
    visibleTabGroups: SettingsTabGroup[];
    panelProps: SettingsTabPanelProps;
    onSearchChange: (value: string) => void;
    onTabChange: (value: SettingsTabId) => void;
    onSave: () => void;
};

export const SettingsPageLayout: React.FC<SettingsPageLayoutProps> = ({
    activeTab,
    isLoading,
    configLoadError,
    toasts,
    setToasts,
    settingsSearch,
    settingsTabs,
    visibleTabGroups,
    panelProps,
    onSearchChange,
    onTabChange,
    onSave,
}) => {
    const panelTopRef = useRef<HTMLDivElement>(null);
    const skipInitialScrollRef = useRef(true);
    const activeMeta = getSettingsTabMeta(activeTab);

    useEffect(() => {
        if (skipInitialScrollRef.current) {
            skipInitialScrollRef.current = false;
            return;
        }
        panelTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, [activeTab]);

    return (
        <div className="w-full flex flex-col box-border">
            <Loader isLoading={isLoading} />
            <ToastContainer toasts={toasts} setToasts={setToasts} />

            {configLoadError && (
                <div className="mb-6 p-4 rounded-xl border border-red-500/40 bg-red-500/10 text-red-200 text-sm">
                    Could not load settings: {configLoadError}. Refresh the page and confirm the container can reach the portal API.
                </div>
            )}

            <div ref={panelTopRef} className="w-full min-w-0 scroll-mt-24">
                <div className="w-full md:grid md:grid-cols-[16rem_minmax(0,1fr)] lg:grid-cols-[17rem_minmax(0,1fr)] md:gap-6 md:items-start">
                    <SettingsNavigation
                        activeTab={activeTab}
                        settingsSearch={settingsSearch}
                        settingsTabs={settingsTabs}
                        visibleTabGroups={visibleTabGroups}
                        onSearchChange={onSearchChange}
                        onTabChange={onTabChange}
                    />

                    <div className="min-w-0 w-full flex flex-col">
                        <header className="flex items-center gap-3 mb-3 mt-0">
                            <h1 className="text-xl md:text-2xl font-bold text-plex leading-none">Settings</h1>
                            <span className="rounded border border-plex/20 bg-plex/10 px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-plex">
                                Admin only
                            </span>
                        </header>
                        {activeMeta?.blurb ? (
                            <p className="text-sm text-muted mb-4">{activeMeta.blurb}</p>
                        ) : (
                            <div className="mb-4" aria-hidden="true" />
                        )}
                        <div className="settings-panel">
                            <SettingsTabPanel {...panelProps} />
                        </div>
                        {!ACTION_ONLY_TABS.has(activeTab) && (
                            <div className="flex justify-end gap-4 mt-6 pb-1">
                                <button
                                    className="w-full sm:w-auto px-6 py-3 bg-plex text-background rounded-lg font-bold hover:bg-plex-hover transition-colors flex items-center justify-center gap-2 shadow-lg shadow-plex/10"
                                    onClick={onSave}
                                >
                                    {SAVE_LABELS[activeTab] || 'Save Settings'}
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
