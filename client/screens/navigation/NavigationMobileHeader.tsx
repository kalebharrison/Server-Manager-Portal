import React from 'react';
import ReactDOM from 'react-dom';
import { FileText, LogOut, Palette } from 'lucide-react';

import { logoUrl } from '../../shared/basePath';
import { THEME_OPTIONS } from './navigationConfig';
import type { NavigationProps } from './types';

type NavigationMobileHeaderProps = Pick<NavigationProps, 'serverName' | 'customLogoUrl' | 'isAdmin' | 'currentRoute' | 'onNavigate' | 'onLogout' | 'activeTheme' | 'setActiveTheme'> & {
    serverIcon: string;
    mobileThemeOpen: boolean;
    setMobileThemeOpen: React.Dispatch<React.SetStateAction<boolean>>;
    mobileThemeRef: React.RefObject<HTMLDivElement | null>;
    mobileThemePos: { top: number; right: number } | null;
};

export const NavigationMobileHeader: React.FC<NavigationMobileHeaderProps> = ({
    serverName,
    customLogoUrl,
    isAdmin,
    currentRoute,
    onNavigate,
    onLogout,
    activeTheme,
    setActiveTheme,
    serverIcon,
    mobileThemeOpen,
    setMobileThemeOpen,
    mobileThemeRef,
    mobileThemePos,
}) => (
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
                        {THEME_OPTIONS.map(opt => (
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
);
