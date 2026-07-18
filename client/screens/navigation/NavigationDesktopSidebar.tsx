import React from 'react';
import { Palette } from 'lucide-react';

import { logoUrl } from '../../shared/basePath';
import { CustomSelect } from '../../shared/ui';
import { isNavCurrent, THEME_OPTIONS } from './navigationConfig';
import type { NavItemConfig } from './navigationConfig';
import type { NavigationProps } from './types';

type NavigationDesktopSidebarProps = Pick<NavigationProps, 'serverName' | 'customLogoUrl' | 'appVersion' | 'activeTheme' | 'setActiveTheme' | 'currentRoute' | 'onNavigate'> & {
    serverIcon: string;
    normalizedNavOrder: string[];
    navItemsConfig: Record<string, NavItemConfig>;
};

export const NavigationDesktopSidebar: React.FC<NavigationDesktopSidebarProps> = ({
    serverName,
    customLogoUrl,
    appVersion,
    activeTheme,
    setActiveTheme,
    currentRoute,
    onNavigate,
    serverIcon,
    normalizedNavOrder,
    navItemsConfig,
}) => (
    <div className="hidden md:flex flex-col w-72 nav-shell border-r p-6 sticky top-0 h-screen overflow-y-auto custom-scrollbar shadow-2xl">
        <div className="flex flex-col gap-2 mt-4">
            {normalizedNavOrder.map((key) => {
                const item = navItemsConfig[key];
                if (!item) return null;
                if (key === 'logs') return null;

                const isCurrent = item.route ? isNavCurrent(currentRoute, key, item.route) : false;

                if (item.href) {
                    return (
                        <a key={key} href={item.href} target="_blank" rel="noreferrer" className="flex items-center gap-4 p-3 text-muted no-underline rounded-lg transition-all font-medium hover:bg-white/5 hover:text-text">
                            <item.icon className="w-5 h-5 flex-shrink-0" /> {item.label}
                        </a>
                    );
                }

                return (
                    <button key={key} type="button" className={`flex items-center gap-3 p-3 rounded-xl transition-all font-medium bg-transparent border-0 cursor-pointer ${isCurrent ? 'nav-item-active' : 'text-muted hover:bg-white/5 hover:text-text'}`} onClick={(e) => { e.preventDefault(); if (item.onClick) item.onClick(e); else onNavigate(item.route as any); }}>
                        <item.icon className="w-5 h-5 flex-shrink-0" />
                        <span>{item.label}</span>
                        {item.adminOnly && <span className="ml-auto rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-muted">Admin</span>}
                    </button>
                );
            })}
        </div>

        <div className="flex flex-col items-center w-full mt-auto pt-10 pb-4 group cursor-default">
            <div className={`relative mb-6 ${customLogoUrl ? 'w-48 flex items-center justify-center' : ''}`}>
                {customLogoUrl ? (
                    <img
                        src={serverIcon}
                        alt="Server Logo"
                        className="w-44 h-44 object-contain drop-shadow-[0_0_24px_rgba(0,0,0,0.75)] group-hover:scale-105 transition-transform duration-700 ease-out"
                        onError={(e) => {
                            (e.target as HTMLImageElement).src = logoUrl();
                        }}
                    />
                ) : (
                    <>
                        <div className="absolute inset-0 bg-plex blur-[25px] opacity-20 group-hover:opacity-40 transition-opacity duration-700 rounded-full"></div>
                        <div className="absolute -inset-1 rounded-full bg-gradient-to-tr from-plex via-amber-300 to-orange-600 opacity-60 group-hover:opacity-100 group-hover:rotate-180 transition-all duration-1000 ease-out"></div>
                        <div className="relative w-28 h-28 rounded-full p-[4px] shadow-2xl bg-card">
                            <div className="w-full h-full rounded-full overflow-hidden bg-background">
                                <img
                                    src={serverIcon}
                                    alt="Server Logo"
                                    className={`w-full h-full group-hover:scale-110 transition-transform duration-700 ease-out ${customLogoUrl ? 'object-contain p-3' : 'object-cover'}`}
                                    onError={(e) => {
                                        (e.target as HTMLImageElement).src = logoUrl();
                                    }}
                                />
                            </div>
                        </div>
                    </>
                )}
            </div>

            <div className="flex flex-col items-center text-center px-2">
                <h2 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-b from-white via-gray-100 to-gray-400 drop-shadow-md tracking-tight leading-tight line-clamp-2">
                    {serverName}
                </h2>
                <div className="mt-2 flex items-center gap-2">
                    <div className="h-px w-6 bg-gradient-to-r from-transparent to-plex/50"></div>
                    <span className="text-[10px] uppercase tracking-[0.3em] text-plex font-bold drop-shadow-[0_0_8px_rgba(229,160,13,0.5)]">
                        Portal
                    </span>
                    <div className="h-px w-6 bg-gradient-to-l from-transparent to-plex/50"></div>
                </div>
                <div className="mt-4 mb-2 relative w-full px-2">
                    <Palette className="w-4 h-4 text-muted absolute left-5 top-1/2 -translate-y-1/2 pointer-events-none z-10" />
                    <CustomSelect
                        value={activeTheme}
                        onChange={setActiveTheme}
                        compact={true}
                        className="w-full [&_div]:pl-9"
                        options={[...THEME_OPTIONS]}
                    />
                </div>
                {appVersion && (
                    <div className="mt-2 text-[10px] text-white/50 font-mono tracking-wider opacity-80 hover:opacity-100 transition-opacity">
                        {appVersion}
                    </div>
                )}
            </div>
        </div>
    </div>
);
