import React from 'react';

import { Loader, Toast } from '../shared/toast';
import { UserDashboardLayout } from '../home/UserDashboardLayout';
import { HomeWeekCalendar } from '../home/HomeWeekCalendar';
import { ActiveStreamsPanel } from './discover/ActiveStreamsPanel';
import { HomeHero } from './user/HomeHero';
import { HomeWatchActivity } from './user/HomeWatchActivity';
import { HomeWrapUpSection } from './user/HomeWrapUpSection';
import { useUserDashboard } from './user/useUserDashboard';

export const UserDashboard: React.FC<{ sessionInfo: any; publicConfig?: any; refreshSession: () => void; onViewAdmin: () => void; onViewSettings?: () => void; onViewLogs?: () => void }> = ({ sessionInfo, publicConfig, refreshSession, onViewAdmin, onViewSettings, onViewLogs }) => {
    const dashboard = useUserDashboard({
        sessionInfo,
        publicConfig,
        refreshSession,
        onViewAdmin,
        onViewSettings,
        onViewLogs,
    });

    return (
        <div className="w-full flex flex-col gap-3 md:gap-4">
            <Loader isLoading={dashboard.isLoading} isCinematic={!!publicConfig?.useCinematicLoading} />
            {dashboard.toast && <Toast message={dashboard.toast.message} type={dashboard.toast.type} onDismiss={() => dashboard.setToast(null)} />}

            <HomeHero
                analytics={dashboard.analytics}
                dashboardData={dashboard.dashboardData}
                publicConfig={publicConfig}
                sessionInfo={sessionInfo}
                user={dashboard.user}
            />

            {sessionInfo.session.isAdmin && (
                <ActiveStreamsPanel isAdmin isJellyfinPortal={dashboard.isJellyfinPortal} variant="compact" />
            )}

            <UserDashboardLayout
                layoutConfig={dashboard.memberLayoutConfig}
                layoutCtx={dashboard.layoutCtx}
                renderMainGridWidget={dashboard.renderMainGridWidget}
                renderRecentlyAddedWidget={dashboard.renderRecentlyAddedWidget}
                renderMyRequests={dashboard.renderMyRequests}
                renderWeekCalendar={() => <HomeWeekCalendar cacheMinutes={publicConfig?.cacheRefreshMinutes} cacheScope={dashboard.libraryStorageKey} />}
                hasDashboardData={!!dashboard.dashboardData}
                renderWrapUp={() => (
                    <HomeWrapUpSection
                        analytics={dashboard.analytics}
                        analyticsDays={dashboard.analyticsDays}
                        analyticsError={dashboard.analyticsError}
                        analyticsLoading={dashboard.analyticsLoading}
                        canShowAnalytics={!!(sessionInfo.session.isAdmin || dashboard.user)}
                        onAnalyticsDaysChange={dashboard.setAnalyticsDays}
                    />
                )}
                renderWatchRow={() => (
                    <HomeWatchActivity
                        analytics={dashboard.analytics}
                        analyticsLoading={dashboard.analyticsLoading}
                        canShowAnalytics={!!(sessionInfo.session.isAdmin || dashboard.user)}
                        recentHistoryRows={publicConfig?.dashboardLayout?.recentHistoryRows}
                        topWatchedRows={publicConfig?.dashboardLayout?.topWatchedRows}
                    />
                )}
            />
        </div>
    );
};
