import React, { useMemo } from 'react';

import { CustomSelect } from '../shared/ui';
import type { SettingsTab, SettingsTabGroup, SettingsTabId } from './settingsTabs';

type SettingsNavigationProps = {
    activeTab: SettingsTabId;
    settingsSearch: string;
    settingsTabs: SettingsTab[];
    visibleTabGroups: SettingsTabGroup[];
    onSearchChange: (value: string) => void;
    onTabChange: (value: SettingsTabId) => void;
};

const AdminBadge: React.FC = () => (
    <span className="ml-auto shrink-0 rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-muted">
        Admin
    </span>
);

export const SettingsNavigation: React.FC<SettingsNavigationProps> = ({
    activeTab,
    settingsSearch,
    settingsTabs,
    visibleTabGroups,
    onSearchChange,
    onTabChange,
}) => {
    const mobileOptions = useMemo(() => {
        const groups = visibleTabGroups.length
            ? visibleTabGroups
            : [{ title: '', tabs: settingsTabs }];
        const options: { label: string; value: string; isGroup?: boolean }[] = [];
        for (const group of groups) {
            if (group.title) {
                options.push({ label: group.title, value: `group:${group.title}`, isGroup: true });
            }
            for (const tab of group.tabs) {
                options.push({
                    label: tab.adminOnly ? `${tab.label} (Admin)` : tab.label,
                    value: tab.id,
                });
            }
        }
        return options;
    }, [settingsTabs, visibleTabGroups]);

    return (
        <>
            <div className="block md:hidden mb-6">
                <label htmlFor="settings-tab-select" className="text-muted text-xs uppercase tracking-wider font-bold mb-2 block">Settings Category</label>
                <CustomSelect
                    id="settings-tab-select"
                    value={activeTab}
                    onChange={val => onTabChange(val as SettingsTabId)}
                    options={mobileOptions}
                />
            </div>

            <aside className="hidden md:flex md:flex-col w-full sticky top-20 max-h-[calc(100vh-6rem)] glass-card nav-shell p-5 shadow-2xl overflow-hidden">
                <label className="text-muted text-xs uppercase tracking-wider font-bold mb-2 block shrink-0 leading-none">Find Setting</label>
                <input
                    type="text"
                    placeholder="Search settings..."
                    value={settingsSearch}
                    onChange={(e) => onSearchChange(e.target.value)}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm text-text focus:outline-none focus:border-plex transition-colors mb-4 shrink-0"
                />
                {visibleTabGroups.length === 0 ? (
                    <p className="text-xs text-muted px-2 py-3">No settings sections found.</p>
                ) : (
                    <div className="space-y-4 overflow-y-auto custom-scrollbar min-h-0 pr-1 -mr-1">
                        {visibleTabGroups.map(group => (
                            <div key={group.title}>
                                <p className="text-[10px] uppercase tracking-wider font-bold text-plex px-3 mb-1.5">{group.title}</p>
                                <div className="space-y-1">
                                    {group.tabs.map(tab => (
                                        <button
                                            key={tab.id}
                                            type="button"
                                            onClick={() => onTabChange(tab.id)}
                                            title={tab.blurb}
                                            className={`w-full flex items-center gap-2 text-left px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${activeTab === tab.id
                                                ? 'nav-item-active'
                                                : 'text-muted hover:text-text hover:bg-white/5'
                                                }`}
                                        >
                                            <span className="min-w-0 truncate">{tab.label}</span>
                                            {tab.adminOnly ? <AdminBadge /> : null}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </aside>
        </>
    );
};
