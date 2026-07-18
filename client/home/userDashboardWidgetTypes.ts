import type React from 'react';

export type PosterCardProps = {
    item: { title: string; thumb?: string; plexUrl: string; tags?: string[]; year?: number | string; parentTitle?: string };
    aspect?: '2/3' | 'square';
    variant?: 'discover' | 'home';
    className?: string;
    footer?: React.ReactNode;
    showQualityBadges?: boolean;
};

export type MainGridWidgetDeps = {
    sessionInfo: any;
    publicConfig?: any;
    user: any;
    isRevoked: boolean;
    isExpiringSoon: boolean;
    daysLeft: number | null;
    progressPct: number;
    newsletterOptIn: boolean;
    serverStats: any;
    serverDataLoading: boolean;
    analytics: any;
    analyticsLoading: boolean;
    analyticsDays: number | 'all';
    analyticsDaysOpen: boolean;
    setAnalyticsDays: (days: number | 'all') => void;
    setAnalyticsDaysOpen: (open: boolean) => void;
    handleRelink: () => void;
    handleToggleNewsletter: () => void;
    onViewAdmin: () => void;
    onViewSettings?: () => void;
    onViewLogs?: () => void;
    setToast: (toast: { id: number; message: string; type: 'success' | 'error' }) => void;
    RebuildLibraryCacheButton: React.ComponentType;
};

export type RecentlyAddedWidgetDeps = {
    publicConfig?: any;
    showQualityBadges: boolean;
    dashboardData: any;
    DiscoverPosterCard: React.ComponentType<PosterCardProps>;
};

export type UserDashboardWidgetDeps = MainGridWidgetDeps & RecentlyAddedWidgetDeps;
