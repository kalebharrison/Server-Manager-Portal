import React from 'react';

import { NavigationDesktopSidebar } from './navigation/NavigationDesktopSidebar';
import { NavigationMobileBottomBar } from './navigation/NavigationMobileBottomBar';
import { NavigationMobileHeader } from './navigation/NavigationMobileHeader';
import { useNavigation } from './navigation/useNavigation';
import type { NavigationProps } from './navigation/types';

export type { NavigationProps, NavigationRoute } from './navigation/types';

export const Navigation: React.FC<NavigationProps> = (props) => {
    const {
        currentRoute,
        onNavigate,
        onLogout,
        isAdmin,
        serverName,
        customLogoUrl,
        appVersion,
        activeTheme,
        setActiveTheme,
    } = props;

    const {
        serverIcon,
        mobileThemeOpen,
        setMobileThemeOpen,
        mobileThemeRef,
        mobileThemePos,
        navItemsConfig,
        normalizedNavOrder,
    } = useNavigation(props);

    return (
        <>
            <NavigationMobileHeader
                serverName={serverName}
                customLogoUrl={customLogoUrl}
                isAdmin={isAdmin}
                currentRoute={currentRoute}
                onNavigate={onNavigate}
                onLogout={onLogout}
                activeTheme={activeTheme}
                setActiveTheme={setActiveTheme}
                serverIcon={serverIcon}
                mobileThemeOpen={mobileThemeOpen}
                setMobileThemeOpen={setMobileThemeOpen}
                mobileThemeRef={mobileThemeRef}
                mobileThemePos={mobileThemePos}
            />

            <NavigationDesktopSidebar
                serverName={serverName}
                customLogoUrl={customLogoUrl}
                appVersion={appVersion}
                activeTheme={activeTheme}
                setActiveTheme={setActiveTheme}
                currentRoute={currentRoute}
                onNavigate={onNavigate}
                serverIcon={serverIcon}
                normalizedNavOrder={normalizedNavOrder}
                navItemsConfig={navItemsConfig}
            />

            <NavigationMobileBottomBar
                currentRoute={currentRoute}
                onNavigate={onNavigate}
                normalizedNavOrder={normalizedNavOrder}
                navItemsConfig={navItemsConfig}
            />
        </>
    );
};
