import { useEffect, useMemo, useRef, useState } from 'react';

import { logoUrl, portalUrl, resolvePortalAssetUrl } from '../../shared/basePath';
import { updateFavicon } from '../../shared/favicon';
import { buildNavItemsConfig } from './navigationConfig';
import type { NavigationProps } from './types';

export const useNavigation = ({
    onLogout,
    isAdmin,
    adminThumb,
    customLogoUrl,
    navOrder,
    navFeatures,
}: Pick<NavigationProps, 'onLogout' | 'isAdmin' | 'adminThumb' | 'customLogoUrl' | 'navOrder' | 'navFeatures'>) => {
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

    const navItemsConfig = useMemo(() => buildNavItemsConfig(onLogout), [onLogout]);

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
    }, [navOrder, isAdmin, navFeatures, navItemsConfig]);

    return {
        serverIcon,
        mobileThemeOpen,
        setMobileThemeOpen,
        mobileThemeRef,
        mobileThemePos,
        navItemsConfig,
        normalizedNavOrder,
    };
};
