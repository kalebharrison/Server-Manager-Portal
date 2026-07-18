import { useEffect, useMemo, useState } from 'react';

import { SETTINGS_TAB_GROUPS, isSettingsTabId, type SettingsTabId } from './settingsTabs';

export const useSettingsTabs = () => {
    const [activeTab, setActiveTab] = useState<SettingsTabId>(() => {
        const hash = window.location.hash.replace('#', '');
        return isSettingsTabId(hash) ? hash : 'branding';
    });
    const [settingsSearch, setSettingsSearch] = useState('');

    const settingsTabsFlat = useMemo(() => SETTINGS_TAB_GROUPS.flatMap(group => group.tabs), []);
    const visibleTabGroups = useMemo(() => {
        const searchTerm = settingsSearch.trim().toLowerCase();
        return SETTINGS_TAB_GROUPS
            .map(group => ({
                ...group,
                tabs: group.tabs.filter(tab => {
                    if (!searchTerm) return true;
                    const haystack = `${group.title} ${tab.label} ${(tab.keywords || []).join(' ')}`.toLowerCase();
                    return haystack.includes(searchTerm);
                })
            }))
            .filter(group => group.tabs.length > 0);
    }, [settingsSearch]);

    useEffect(() => {
        const hash = `#${activeTab}`;
        if (window.location.hash !== hash) {
            window.history.replaceState({}, '', `${window.location.pathname}${window.location.search}${hash}`);
        }
    }, [activeTab]);

    useEffect(() => {
        const syncTabFromHash = () => {
            const hash = window.location.hash.replace('#', '');
            if (isSettingsTabId(hash)) {
                setActiveTab(hash);
            } else if (!hash) {
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
