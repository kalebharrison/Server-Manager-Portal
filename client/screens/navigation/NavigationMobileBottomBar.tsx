import React from 'react';

import { isNavCurrent } from './navigationConfig';
import type { NavItemConfig } from './navigationConfig';
import type { NavigationProps } from './types';

type NavigationMobileBottomBarProps = Pick<NavigationProps, 'currentRoute' | 'onNavigate'> & {
    normalizedNavOrder: string[];
    navItemsConfig: Record<string, NavItemConfig>;
};

export const NavigationMobileBottomBar: React.FC<NavigationMobileBottomBarProps> = ({
    currentRoute,
    onNavigate,
    normalizedNavOrder,
    navItemsConfig,
}) => (
    <div className="md:hidden fixed bottom-0 left-0 right-0 w-full nav-shell border-t z-50 pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-center h-16 overflow-x-auto overscroll-x-contain px-[max(0.5rem,env(safe-area-inset-left))] pr-[max(0.5rem,env(safe-area-inset-right))] gap-0.5 hide-scrollbar">
            {normalizedNavOrder.map((key) => {
                const item = navItemsConfig[key];
                if (!item) return null;
                if (key === 'logs' || key === 'logout') return null;

                const isCurrent = item.route ? isNavCurrent(currentRoute, key, item.route) : false;
                const labelOverride = key === 'mediastack' ? 'Media' : key === 'request' ? 'Request' : item.label;

                if (item.href) {
                    return (
                        <a key={key} href={item.href} target="_blank" rel="noreferrer" className="relative flex flex-col items-center justify-center gap-1 h-full text-muted flex-shrink-0 min-w-[4.25rem] px-1 text-center text-[0.65rem] transition-colors hover:text-text">
                            <item.icon className="w-5 h-5 flex-shrink-0" /> {labelOverride}
                        </a>
                    );
                }

                return (
                    <button key={key} type="button" className={`relative flex flex-col items-center justify-center gap-1 h-full flex-shrink-0 min-w-[4.25rem] px-1 text-center text-[0.65rem] transition-colors bg-transparent border-0 cursor-pointer ${isCurrent ? 'text-plex font-bold' : 'text-muted hover:text-text'}`} onClick={(e) => { e.preventDefault(); if (item.onClick) item.onClick(e); else onNavigate(item.route as any); }}>
                        <item.icon className="w-5 h-5 flex-shrink-0" /> {labelOverride}
                        {isCurrent && <div className="absolute bottom-1 w-1.5 h-1.5 rounded-full bg-plex shadow-[0_0_5px_rgba(229,160,13,0.8)]" />}
                    </button>
                );
            })}
        </div>
    </div>
);
