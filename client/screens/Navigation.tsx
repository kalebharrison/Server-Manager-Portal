import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { Activity, AlertTriangle, BarChart3, FileText, Film, Home, Layers, LogOut, Palette, Settings, SlidersHorizontal, Sparkles, Users } from 'lucide-react';

import { logoUrl, portalUrl, resolvePortalAssetUrl } from '../shared/basePath';
import { updateFavicon } from '../shared/favicon';
import { CustomSelect } from '../shared/ui';

interface NavigationProps {
    currentRoute: string;
    onNavigate: (route: 'admin' | 'user' | 'status' | 'dashboard' | 'issues' | 'settings' | 'preferences' | 'logs' | 'analytics' | 'mediastack' | 'request') => void;
    onLogout: () => void;
    isAdmin: boolean;
    serverName: string;
    adminThumb?: string | null;
    customLogoUrl?: string | null;
    navOrder: string[];
    navFeatures?: {
        request?: boolean;
    };
    appVersion?: string;
    activeTheme: string;
    setActiveTheme: (theme: string) => void;
}

export const Navigation: React.FC<NavigationProps> = ({ currentRoute, onNavigate, onLogout, isAdmin, serverName, adminThumb, customLogoUrl, navOrder, navFeatures, appVersion, activeTheme, setActiveTheme }) => {
    const serverIcon = customLogoUrl ? resolvePortalAssetUrl(customLogoUrl) : (adminThumb ? (adminThumb.startsWith('http') ? adminThumb : portalUrl(`/api/plex/image?path=${encodeURIComponent(adminThumb)}&width=256&height=256`)) : logoUrl());
    useEffect(() => {
        updateFavicon(serverIcon);
    }, [serverIcon]);

    const [mobileThemeOpen, setMobileThemeOpen] = useState(false);
    const mobileThemeRef = useRef<HTMLDivElement>(null);
    const [mobileThemePos, setMobileThemePos] = useState<{ top: number; right: number } | null>(null);

    useEffect(() => {
        if (!mobileThemeOpen) { setMobileThemePos(null); return; }
        if (mobileThemeRef.current) {
            const rect = mobileThemeRef.current.getBoundingClientRect();
            setMobileThemePos({ top: rect.bottom + 6, right: window.innerWidth - rect.right });
        }
    }, [mobileThemeOpen]);

    useEffect(() => {
        if (!mobileThemeOpen) return;
        const handler = (e: MouseEvent) => {
            if (mobileThemeRef.current && !mobileThemeRef.current.contains(e.target as Node)) {
                setMobileThemeOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [mobileThemeOpen]);

    const navItemsConfig: Record<string, { label: string; icon: React.FC<any>; route: string; adminOnly: boolean; href?: string; onClick?: (e: any) => void }> = {
        'home': { label: 'Home', icon: Home, route: 'user', adminOnly: false },
        'users': { label: 'Users', icon: Users, route: 'users', adminOnly: true },
        'discover': { label: 'Discover', icon: Film, route: 'dashboard', adminOnly: false },
        'issues': { label: 'Issues', icon: AlertTriangle, route: 'issues', adminOnly: false },
        'status': { label: 'Status', icon: Activity, route: 'status', adminOnly: false },
        'logs': { label: 'Logs', icon: FileText, route: 'logs', adminOnly: true },
        'analytics': { label: 'Analytics', icon: BarChart3, route: 'analytics', adminOnly: false },
        'mediastack': { label: 'Calendar', icon: Layers, route: 'mediastack', adminOnly: false },
        'request': { label: 'Request Content', icon: Sparkles, route: 'request', adminOnly: false },
        'preferences': { label: 'Preferences', icon: SlidersHorizontal, route: 'preferences', adminOnly: false },
        'settings': { label: 'Settings', icon: Settings, route: 'settings', adminOnly: true },
        'logout': { label: 'Logout', icon: LogOut, route: '', adminOnly: false, onClick: onLogout }
    };
    const normalizedNavOrder = useMemo(() => {
        const order = Array.isArray(navOrder) ? navOrder.filter((key) => key !== 'maintenance') : [];
        if (!isAdmin && !order.includes('preferences')) {
            const logoutIndex = order.indexOf('logout');
            if (logoutIndex >= 0) order.splice(logoutIndex, 0, 'preferences');
            else order.push('preferences');
        }
        if (!order.includes('issues')) {
            const discoverIndex = order.indexOf('discover');
            order.splice(discoverIndex >= 0 ? discoverIndex + 1 : 1, 0, 'issues');
        }
        return order.filter((key) => {
            const item = navItemsConfig[key];
            if (!item) return false;
            if (item.adminOnly && !isAdmin) return false;
            if (key === 'request' && navFeatures?.request === false) return false;
            return true;
        });
    }, [navOrder, isAdmin, navFeatures]);

    const isNavCurrent = (key: string, route: string) => (
        ['admin', 'user'].includes(currentRoute) && key === 'home' ? true : currentRoute === route
    );

    return (
        <>
            <div className="md:hidden fixed top-0 left-0 right-0 h-16 nav-shell border-b z-50 flex items-center justify-between px-4 pt-[env(safe-area-inset-top)] shadow-lg">
                <div className="flex items-center gap-3">
                    <img
                        src={serverIcon}
                        alt="Logo"
                        className={`w-10 h-10 ${customLogoUrl ? 'object-contain' : 'rounded-full object-cover'}`}
                        onError={(e) => {
                            (e.target as HTMLImageElement).src = logoUrl();
                        }}
                    />
                    <span className="font-bold text-text uppercase tracking-widest text-sm">{serverName}</span>
                </div>
                <div className="flex items-center gap-4">
                    <div className="relative" ref={mobileThemeRef}>
                        <button
                            onClick={() => setMobileThemeOpen(v => !v)}
                            className={`w-8 h-8 flex items-center justify-center rounded-lg border transition-all ${mobileThemeOpen ? 'border-plex text-plex ring-1 ring-plex' : 'border-border text-muted hover:border-plex/50 hover:text-text'}`}
                            title="Change theme"
                        >
                            <Palette className="w-4 h-4" />
                        </button>
                        {mobileThemeOpen && mobileThemePos && ReactDOM.createPortal(
                            <div
                                style={{ position: 'fixed', top: mobileThemePos.top, right: mobileThemePos.right, zIndex: 99999 }}
                                className="bg-card border border-border rounded-lg shadow-2xl py-1 min-w-[140px]"
                            >
                                {[
                                    { label: 'Plex Dark', value: 'plex' },
                                    { label: 'Sleek Slate', value: 'slate' },
                                    { label: 'Nordic Frost', value: 'nordic' },
                                    { label: 'Jellyfin Purple', value: 'jellyfin' },
                                    { label: 'Emerald Green', value: 'emerald' },
                                    { label: 'Neon Midnight', value: 'midnight' },
                                ].map(opt => (
                                    <div
                                        key={opt.value}
                                        className={`px-4 py-2.5 cursor-pointer text-sm whitespace-nowrap transition-colors ${activeTheme === opt.value ? 'bg-plex/10 text-plex font-bold' : 'text-text hover:bg-border/40'}`}
                                        onMouseDown={e => { e.preventDefault(); setActiveTheme(opt.value); setMobileThemeOpen(false); }}
                                    >
                                        {opt.label}
                                    </div>
                                ))}
                            </div>,
                            document.body
                        )}
                    </div>
                    {isAdmin && (
                        <button onClick={(e) => { e.preventDefault(); onNavigate('logs'); }} className={`text-muted hover:text-text transition-colors ${currentRoute === 'logs' ? 'text-plex' : ''}`}>
                            <FileText className="w-5 h-5" />
                        </button>
                    )}
                    <button onClick={(e) => { e.preventDefault(); onLogout(); }} className="text-muted hover:text-red-500 transition-colors ml-1">
                        <LogOut className="w-5 h-5" />
                    </button>
                </div>
            </div>

            <div className="hidden md:flex flex-col w-72 nav-shell border-r p-6 sticky top-0 h-screen overflow-y-auto custom-scrollbar shadow-2xl">
                <div className="flex flex-col gap-2 mt-4">
                    {normalizedNavOrder.map((key) => {
                        const item = navItemsConfig[key];
                        if (!item) return null;
                        if (key === 'logs') return null;

                        const isCurrent = item.route ? isNavCurrent(key, item.route) : false;

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
                                options={[
                                    { label: 'Plex Dark', value: 'plex' },
                                    { label: 'Sleek Slate', value: 'slate' },
                                    { label: 'Nordic Frost', value: 'nordic' },
                                    { label: 'Jellyfin Purple', value: 'jellyfin' },
                                    { label: 'Emerald Green', value: 'emerald' },
                                    { label: 'Neon Midnight', value: 'midnight' },
                                ]}
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

            <div className="md:hidden fixed bottom-0 left-0 right-0 w-full nav-shell border-t z-50 pb-[env(safe-area-inset-bottom)]">
                <div className="flex items-center h-16 overflow-x-auto overscroll-x-contain px-[max(0.5rem,env(safe-area-inset-left))] pr-[max(0.5rem,env(safe-area-inset-right))] gap-0.5 hide-scrollbar">
                    {normalizedNavOrder.map((key) => {
                        const item = navItemsConfig[key];
                        if (!item) return null;
                        if (key === 'logs' || key === 'logout') return null;

                        const isCurrent = item.route ? isNavCurrent(key, item.route) : false;
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
        </>
    );
};
