import { useEffect, useMemo, useState } from 'react';

import { SETTINGS_TAB_GROUPS, settingsTabIdFromHash, type SettingsTabId } from './settingsTabs';

export const useSettingsTabs = () => {
    const [activeTab, setActiveTab] = useState<SettingsTabId>(() => (
        settingsTabIdFromHash(window.location.hash) || 'branding'
    ));
    const [settingsSearch, setSettingsSearch] = useState('');

    const settingsTabsFlat = useMemo(() => SETTINGS_TAB_GROUPS.flatMap(group => group.tabs), []);
    const visibleTabGroups = useMemo(() => {
        const searchTerm = settingsSearch.trim().toLowerCase();
        return SETTINGS_TAB_GROUPS
            .map(group => ({
                ...group,
                tabs: group.tabs.filter(tab => {
                    if (!searchTerm) return true;
                    const haystack = `${group.title} ${tab.label} ${tab.blurb} ${(tab.keywords || []).join(' ')}`.toLowerCase();
                    return haystack.includes(searchTerm);
                })
            }))
            .filter(group => group.tabs.length > 0);
    }, [settingsSearch]);

    useEffect(() => {
        const current = window.location.hash.replace(/^#/, '');
        const currentTab = settingsTabIdFromHash(current);
        // Preserve QC subpaths like #upgrader/hunt when already on that tab.
        if (currentTab === activeTab && (current === activeTab || current.startsWith(`${activeTab}/`))) {
            return;
        }
        // Preserve legacy #qbittorrent / #sabnzbd while on upgrader.
        if (activeTab === 'upgrader' && (current === 'qbittorrent' || current === 'sabnzbd')) {
            return;
        }
        const hash = `#${activeTab}`;
        if (window.location.hash !== hash) {
            window.history.replaceState({}, '', `${window.location.pathname}${window.location.search}${hash}`);
        }
    }, [activeTab]);

    useEffect(() => {
        const syncTabFromHash = () => {
            const tab = settingsTabIdFromHash(window.location.hash);
            if (tab) {
                setActiveTab(tab);
            } else if (!window.location.hash.replace(/^#/, '').trim()) {
                setActiveTab('branding');
            }
        };
        window.addEventListener('hashchange', syncTabFromHash);
        return () => window.removeEventListener('hashchange', syncTabFromHash);
    }, []);

    return {
        activeTab,
        setActiveTab,
        settingsSearch,
        setSettingsSearch,
        settingsTabsFlat,
        visibleTabGroups,
    };
};
