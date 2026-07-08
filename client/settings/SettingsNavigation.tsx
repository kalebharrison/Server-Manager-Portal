import React from 'react';

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

export const SettingsNavigation: React.FC<SettingsNavigationProps> = ({
    activeTab,
    settingsSearch,
    settingsTabs,
    visibleTabGroups,
    onSearchChange,
    onTabChange,
}) => (
    <>
        <div className="block md:hidden mb-6">
            <label htmlFor="settings-tab-select" className="text-muted text-xs uppercase tracking-wider font-bold mb-2 block">Settings Category</label>
            <CustomSelect
                id="settings-tab-select"
                value={activeTab}
                onChange={val => onTabChange(val as SettingsTabId)}
                options={settingsTabs.map(tab => ({ label: tab.label, value: tab.id }))}
            />
        </div>

        <aside className="hidden md:flex md:flex-col w-72 shrink-0 h-fit sticky top-20 glass-card nav-shell p-6 shadow-2xl">
            <label className="text-muted text-xs uppercase tracking-wider font-bold mb-2 block">Find Setting</label>
            <input
                type="text"
                placeholder="Search settings..."
                value={settingsSearch}
                onChange={(e) => onSearchChange(e.target.value)}
                className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm text-text focus:outline-none focus:border-plex transition-colors mb-4"
            />
            {visibleTabGroups.length === 0 ? (
                <p className="text-xs text-muted px-2 py-3">No settings sections found.</p>
            ) : (
                <div className="space-y-4">
                    {visibleTabGroups.map(group => (
                        <div key={group.title}>
                            <p className="text-[10px] uppercase tracking-wider font-bold text-plex px-3 mb-1.5">{group.title}</p>
                            <div className="space-y-1">
                                {group.tabs.map(tab => (
                                    <button
                                        key={tab.id}
                                        onClick={() => onTabChange(tab.id)}
                                        className={`w-full text-left px-3 py-3 rounded-lg text-sm font-medium transition-all ${activeTab === tab.id
                                            ? 'nav-item-active'
                                            : 'text-muted hover:text-text hover:bg-white/5'
                                            }`}
                                    >
                                        {tab.label}
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
