import React, { useMemo, useState } from 'react';
import { MoreHorizontal, X } from 'lucide-react';

import { isNavCurrent } from './navigationConfig';
import type { NavItemConfig } from './navigationConfig';
import type { NavigationProps } from './types';

const MOBILE_NAV_PRIMARY_SLOTS = 7;

type NavigationMobileBottomBarProps = Pick<NavigationProps, 'currentRoute' | 'onNavigate'> & {
    normalizedNavOrder: string[];
    navItemsConfig: Record<string, NavItemConfig>;
};

const NavButton: React.FC<{
    itemKey: string;
    item: NavItemConfig;
    currentRoute: string;
    onNavigate: NavigationProps['onNavigate'];
    onAfterNavigate?: () => void;
    compact?: boolean;
}> = ({ itemKey, item, currentRoute, onNavigate, onAfterNavigate, compact }) => {
    const isCurrent = item.route ? isNavCurrent(currentRoute, itemKey, item.route) : false;
    const labelOverride = itemKey === 'mediastack' ? 'Media' : itemKey === 'request' ? 'Request' : item.label;

    if (item.href) {
        return (
            <a
                key={itemKey}
                href={item.href}
                target="_blank"
                rel="noreferrer"
                className={compact
                    ? 'flex items-center gap-3 px-4 py-3 rounded-lg text-muted hover:bg-white/5 hover:text-text'
                    : 'relative flex flex-col items-center justify-center gap-1 h-full text-muted flex-1 min-w-0 px-0.5 text-center text-[0.65rem] transition-colors hover:text-text'}
                onClick={onAfterNavigate}
            >
                <item.icon className={compact ? 'w-5 h-5' : 'w-5 h-5 flex-shrink-0'} />
                <span className={compact ? 'text-sm font-medium' : 'truncate w-full'}>{labelOverride}</span>
            </a>
        );
    }

    return (
        <button
            key={itemKey}
            type="button"
            className={compact
                ? `flex items-center gap-3 px-4 py-3 rounded-lg w-full text-left transition-colors ${isCurrent ? 'bg-plex/15 text-plex font-bold' : 'text-muted hover:bg-white/5 hover:text-text'}`
                : `relative flex flex-col items-center justify-center gap-1 h-full flex-1 min-w-0 px-0.5 text-center text-[0.65rem] transition-colors bg-transparent border-0 cursor-pointer ${isCurrent ? 'text-plex font-bold' : 'text-muted hover:text-text'}`}
            onClick={(e) => {
                e.preventDefault();
                if (item.onClick) item.onClick(e);
                else onNavigate(item.route as any);
                onAfterNavigate?.();
            }}
        >
            <item.icon className={compact ? 'w-5 h-5' : 'w-5 h-5 flex-shrink-0'} />
            <span className={compact ? 'text-sm font-medium' : 'truncate w-full'}>{labelOverride}</span>
            {!compact && isCurrent && <div className="absolute bottom-1 w-1.5 h-1.5 rounded-full bg-plex shadow-[0_0_5px_rgba(229,160,13,0.8)]" />}
        </button>
    );
};

export const NavigationMobileBottomBar: React.FC<NavigationMobileBottomBarProps> = ({
    currentRoute,
    onNavigate,
    normalizedNavOrder,
    navItemsConfig,
}) => {
    const [moreOpen, setMoreOpen] = useState(false);

    const barKeys = useMemo(
        () => normalizedNavOrder.filter((key) => key !== 'logs' && key !== 'logout' && navItemsConfig[key]),
        [normalizedNavOrder, navItemsConfig],
    );

    const primaryKeys = barKeys.slice(0, MOBILE_NAV_PRIMARY_SLOTS);
    const overflowKeys = barKeys.slice(MOBILE_NAV_PRIMARY_SLOTS);
    const moreActive = overflowKeys.some((key) => {
        const item = navItemsConfig[key];
        return item?.route ? isNavCurrent(currentRoute, key, item.route) : false;
    });

    return (
        <>
            <div className="md:hidden fixed bottom-0 left-0 right-0 w-full nav-shell border-t z-50 pb-[env(safe-area-inset-bottom)]">
                <div className="flex items-stretch h-16 px-[max(0.25rem,env(safe-area-inset-left))] pr-[max(0.25rem,env(safe-area-inset-right))]">
                    {primaryKeys.map((key) => {
                        const item = navItemsConfig[key];
                        if (!item) return null;
                        return (
                            <NavButton
                                key={key}
                                itemKey={key}
                                item={item}
                                currentRoute={currentRoute}
                                onNavigate={onNavigate}
                            />
                        );
                    })}
                    {overflowKeys.length > 0 && (
                        <button
                            type="button"
                            className={`relative flex flex-col items-center justify-center gap-1 h-full flex-1 min-w-0 px-0.5 text-center text-[0.65rem] transition-colors bg-transparent border-0 cursor-pointer ${moreActive || moreOpen ? 'text-plex font-bold' : 'text-muted hover:text-text'}`}
                            onClick={() => setMoreOpen(true)}
                            aria-label="More navigation"
                        >
                            <MoreHorizontal className="w-5 h-5 flex-shrink-0" />
                            <span className="truncate w-full">More</span>
                            {(moreActive || moreOpen) && <div className="absolute bottom-1 w-1.5 h-1.5 rounded-full bg-plex shadow-[0_0_5px_rgba(229,160,13,0.8)]" />}
                        </button>
                    )}
                </div>
            </div>

            {moreOpen && (
                <div className="md:hidden fixed inset-0 z-[60] flex flex-col justify-end">
                    <button
                        type="button"
                        className="absolute inset-0 bg-black/60 backdrop-blur-sm border-0"
                        aria-label="Close more menu"
                        onClick={() => setMoreOpen(false)}
                    />
                    <div className="relative nav-shell border-t rounded-t-2xl p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] max-h-[70vh] overflow-y-auto animate-slide-up">
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="text-sm font-bold uppercase tracking-wider text-plex">More</h3>
                            <button
                                type="button"
                                onClick={() => setMoreOpen(false)}
                                className="p-2 rounded-full text-muted hover:text-text hover:bg-white/5"
                                aria-label="Close"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="flex flex-col gap-1">
                            {overflowKeys.map((key) => {
                                const item = navItemsConfig[key];
                                if (!item) return null;
                                return (
                                    <NavButton
                                        key={key}
                                        itemKey={key}
                                        item={item}
                                        currentRoute={currentRoute}
                                        onNavigate={onNavigate}
                                        onAfterNavigate={() => setMoreOpen(false)}
                                        compact
                                    />
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};
