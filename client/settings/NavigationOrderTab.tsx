import React from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

const NAV_LABELS: Record<string, string> = {
    home: 'Home',
    discover: 'Discover',
    status: 'Status',
    logs: 'Logs (Admin Only)',
    analytics: 'Analytics',
    mediastack: 'Integrations',
    maintenance: 'Cleaner (Admin Only)',
    request: 'Request Content',
    settings: 'Settings (Admin Only)',
    logout: 'Logout',
};

type NavigationOrderTabProps = {
    navOrder: string[];
    onNavOrderChange: (order: string[]) => void;
};

export const NavigationOrderTab: React.FC<NavigationOrderTabProps> = ({ navOrder, onNavOrderChange }) => (
    <div className="mb-8 animate-fade-in">
        <h3 className="text-xl font-bold text-plex mb-4 border-b border-border pb-2">Navigation Order</h3>
        <p className="text-muted text-sm mb-4">Drag and drop or use the arrows to reorder the navigation items on the sidebar.</p>
        <div className="flex flex-col gap-2 max-w-md">
            {navOrder.map((key, index) => (
                <div key={key} className="flex items-center justify-between py-3 border-b border-border/40">
                    <div className="flex items-center gap-3">
                        <div className="text-text font-medium">{NAV_LABELS[key] || key}</div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
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
            ))}
        </div>
    </div>
);
