import { useCallback, useEffect, useMemo, useState } from 'react';

import { apiFetch } from '../../shared/api';
import { getAccessProgressPct, getDaysUntilExpiry } from '../../shared/format';
import type { ToastMessage } from '../../shared/types';
import {
    resolveHomeShowWeekCalendar,
    resolveHomeShowWrapUp,
} from '../../shared/userProfile';
import { createMainGridWidgetRenderer, createRecentlyAddedWidgetRenderer } from '../../home/userDashboardWidgetRenderers';
import { RebuildLibraryCacheButton } from '../RebuildLibraryCacheButton';
import { DiscoverPosterCard } from '../DiscoverContent';
import { homeLibraryCacheKey } from './userDashboardCache';
import { useUserDashboardAnalytics } from './useUserDashboardAnalytics';
import { useUserDashboardServerData } from './useUserDashboardServerData';

type UseUserDashboardOptions = {
    sessionInfo: any;
    publicConfig?: any;
    refreshSession: () => void;
    onViewAdmin: () => void;
    onViewSettings?: () => void;
    onViewLogs?: () => void;
};

export const useUserDashboard = ({
    sessionInfo,
    publicConfig,
    refreshSession,
    onViewAdmin,
    onViewSettings,
    onViewLogs,
}: UseUserDashboardOptions) => {
    const libraryStorageKey = homeLibraryCacheKey(sessionInfo, publicConfig);
    const [isLoading, setIsLoading] = useState(false);
    const [toast, setToast] = useState<ToastMessage | null>(null);
    const [analyticsDaysOpen, setAnalyticsDaysOpen] = useState(false);

    const user = sessionInfo.account;
    const showQualityBadges = publicConfig?.showPosterQualityBadges !== false;
    const isJellyfinPortal = String(publicConfig?.mediaServerType || 'plex').toLowerCase() === 'jellyfin';
    const [newsletterOptIn, setNewsletterOptIn] = useState(user?.newsletterOptIn === true);

    const onErrorToast = useCallback((message: string) => {
        setToast({ id: Date.now(), message, type: 'error' });
    }, []);

    useEffect(() => {
        setNewsletterOptIn(user?.newsletterOptIn === true);
    }, [user?.newsletterOptIn]);

    const {
        analytics,
        analyticsLoading,
        analyticsDays,
        setAnalyticsDays,
        analyticsError,
    } = useUserDashboardAnalytics({
        sessionInfo,
        user,
        isJellyfinPortal,
        onErrorToast,
    });

    const {
        serverStats,
        dashboardData,
        serverDataLoading,
    } = useUserDashboardServerData({
        publicConfig,
        libraryStorageKey,
        isJellyfinPortal,
        analyticsLibraryHealth: analytics?.libraryHealth,
    });

    const handleToggleNewsletter = async () => {
        setIsLoading(true);
        try {
            const newValue = !newsletterOptIn;
            await apiFetch('/api/users/preferences', {
                method: 'POST',
                body: JSON.stringify({ newsletterOptIn: newValue })
            });
            setNewsletterOptIn(newValue);
            setToast({ id: 3, message: newValue ? 'Subscribed to the weekly newsletter.' : 'Unsubscribed from the weekly newsletter.', type: 'success' });
            refreshSession();
        } catch (e: any) {
            setToast({ id: 3, message: e.message || 'Failed to update preferences', type: 'error' });
        } finally {
            setIsLoading(false);
        }
    };

    const handleRelink = async () => {
        setIsLoading(true);
        try {
            await apiFetch('/api/users/relink', { method: 'POST' });
            setToast({ id: 2, message: 'Account re-linked! Check your email for the invite.', type: 'success' });
            refreshSession();
        } catch (e: any) {
            setToast({ id: 2, message: e.message || 'Failed to re-link account', type: 'error' });
        } finally {
            setIsLoading(false);
        }
    };

    const daysLeft = user?.expiryDate ? getDaysUntilExpiry(user.expiryDate) : null;
    const progressPct = getAccessProgressPct(user?.expiryDate || null, user?.joiningDate || null);
    const isExpiringSoon = daysLeft !== null && daysLeft <= 7;
    const isRevoked = user?.plexAccessStatus === 'revoked';

    const layoutCtx = useMemo(() => ({
        isAdmin: !!sessionInfo.session.isAdmin,
        hasUser: !!user,
        referralEnabled: !!publicConfig?.referralEnabled,
    }), [sessionInfo.session.isAdmin, user, publicConfig?.referralEnabled]);

    const memberLayoutConfig = useMemo(() => {
        const base = publicConfig?.dashboardLayout || {};
        const hidden = new Set(Array.isArray(base.hiddenSections) ? base.hiddenSections : []);
        if (!resolveHomeShowWrapUp(user)) hidden.add('wrapUp');
        if (!resolveHomeShowWeekCalendar(user)) hidden.add('weekCalendar');
        return { ...base, hiddenSections: Array.from(hidden) };
    }, [publicConfig?.dashboardLayout, user?.homeShowWrapUp, user?.homeShowWeekCalendar]);

    const mainGridWidgetDeps = useMemo(() => ({
        sessionInfo,
        publicConfig,
        user,
        isRevoked,
        isExpiringSoon,
        daysLeft,
        progressPct,
        newsletterOptIn,
        serverStats,
        serverDataLoading,
        analytics,
        analyticsLoading,
        analyticsDays,
        analyticsDaysOpen,
        setAnalyticsDays,
        setAnalyticsDaysOpen,
        handleRelink,
        handleToggleNewsletter,
        onViewAdmin,
        onViewSettings,
        onViewLogs,
        setToast,
        RebuildLibraryCacheButton,
    }), [
        sessionInfo, publicConfig, user, isRevoked, isExpiringSoon, daysLeft, progressPct, newsletterOptIn,
        serverStats, serverDataLoading, analytics, analyticsLoading, analyticsDays, analyticsDaysOpen,
        onViewAdmin, onViewSettings, onViewLogs,
    ]);

    const recentlyAddedWidgetDeps = useMemo(() => ({
        publicConfig,
        showQualityBadges,
        dashboardData,
        DiscoverPosterCard,
    }), [publicConfig, showQualityBadges, dashboardData]);

    const renderMainGridWidget = useMemo(() => createMainGridWidgetRenderer(mainGridWidgetDeps), [mainGridWidgetDeps]);
    const renderRecentlyAddedWidget = useMemo(() => createRecentlyAddedWidgetRenderer(recentlyAddedWidgetDeps), [recentlyAddedWidgetDeps]);

    return {
        isLoading,
        toast,
        setToast,
        user,
        isJellyfinPortal,
        libraryStorageKey,
        analytics,
        analyticsLoading,
        analyticsDays,
        analyticsError,
        dashboardData,
        layoutCtx,
        memberLayoutConfig,
        renderMainGridWidget,
        renderRecentlyAddedWidget,
        setAnalyticsDays,
        sessionInfo,
        publicConfig,
    };
};
