import React, { useMemo } from 'react';
import { ChevronDown, ChevronUp, Eye, EyeOff } from 'lucide-react';

import { ALWAYS_VISIBLE_NAV_KEYS, normalizeNavHiddenKeys } from './settingsNavOrder';

const NAV_LABELS: Record<string, string> = {
    home: 'Home',
    users: 'Users (Admin Only)',
    discover: 'Discover',
    issues: 'Issues',
    status: 'Status',
    logs: 'Logs (Admin Only)',
    analytics: 'Analytics',
    mediastack: 'Calendar',
    request: 'Request Content',
    preferences: 'Preferences',
    scanner: 'Scanner (Admin Only)',
    upgrader: 'Quality Hunt (Admin Only)',
    settings: 'Settings (Admin Only)',
    logout: 'Logout',
};

type NavigationOrderTabProps = {
    navOrder: string[];
    onNavOrderChange: (order: string[]) => void;
    navHiddenKeys: string[];
    onNavHiddenKeysChange: (keys: string[]) => void;
};

export const NavigationOrderTab: React.FC<NavigationOrderTabProps> = ({
    navOrder,
    onNavOrderChange,
    navHiddenKeys,
    onNavHiddenKeysChange,
}) => {
    const hiddenSet = useMemo(() => new Set(normalizeNavHiddenKeys(navHiddenKeys)), [navHiddenKeys]);

    const toggleHidden = (key: string) => {
        if (ALWAYS_VISIBLE_NAV_KEYS.has(key)) return;
        const next = new Set(hiddenSet);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        onNavHiddenKeysChange(normalizeNavHiddenKeys([...next]));
    };

    return (
        <div className="mb-8 animate-fade-in">
            <h3 className="text-xl font-bold text-plex mb-4 border-b border-border pb-2">Navigation Order</h3>
            <p className="text-muted text-sm mb-4">
                Reorder sidebar items with the arrows. Use the eye to hide items server-wide (Home, Settings, and Logout stay visible).
            </p>
            <div className="flex flex-col gap-2 max-w-md">
                {navOrder.map((key, index) => {
                    const isAlwaysVisible = ALWAYS_VISIBLE_NAV_KEYS.has(key);
                    const isHidden = hiddenSet.has(key);
                    return (
                        <div key={key} className="flex items-center justify-between py-3 border-b border-border/40">
                            <div className="flex items-center gap-3">
                                <div className={`font-medium ${isHidden ? 'text-muted line-through' : 'text-text'}`}>
                                    {NAV_LABELS[key] || key}
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    disabled={isAlwaysVisible}
                                    onClick={() => toggleHidden(key)}
                                    title={isAlwaysVisible ? 'Always visible' : (isHidden ? 'Show in nav' : 'Hide from nav')}
                                    className={`p-1 rounded transition-colors ${
                                        isAlwaysVisible
                                            ? 'opacity-30 cursor-not-allowed text-muted'
                                            : isHidden
                                                ? 'text-amber-400 hover:bg-amber-500/10'
                                                : 'hover:bg-white/10 text-muted hover:text-text'
                                    }`}
                                >
                                    {isHidden ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                </button>
                                <button
                                    type="button"
                                    disabled={index === 0}
                                    onClick={() => {
                                        const newOrder = [...navOrder];
                                        [newOrder[index - 1], newOrder[index]] = [newOrder[index], newOrder[index - 1]];
                                        onNavOrderChange(newOrder);
                                    }}
                                    className={`p-1 rounded transition-colors ${index === 0 ? 'opacity-30 cursor-not-allowed' : 'hover:bg-white/10 text-muted hover:text-text'}`}
                                >
                                    <ChevronUp className="w-5 h-5" />
                                </button>
                                <button
                                    type="button"
                                    disabled={index === navOrder.length - 1}
                                    onClick={() => {
                                        const newOrder = [...navOrder];
                                        [newOrder[index + 1], newOrder[index]] = [newOrder[index], newOrder[index + 1]];
                                        onNavOrderChange(newOrder);
                                    }}
                                    className={`p-1 rounded transition-colors ${index === navOrder.length - 1 ? 'opacity-30 cursor-not-allowed' : 'hover:bg-white/10 text-muted hover:text-text'}`}
                                >
                                    <ChevronDown className="w-5 h-5" />
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
