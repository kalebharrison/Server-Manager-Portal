import React, { lazy, Suspense, useEffect, useState } from 'react';

import { Loader } from '../shared/toast';
import { AnalyticsChartsSection, type AnalyticsUser } from './analytics/AnalyticsChartsSection';
import { AnalyticsDashboardHeader, type AnalyticsViewTab } from './analytics/AnalyticsDashboardHeader';
import { AnalyticsLibraryHealth } from './analytics/AnalyticsLibraryHealth';
import { AnalyticsOverviewSection } from './analytics/AnalyticsOverviewSection';
import { useAnalyticsData } from './analytics/useAnalyticsData';

const TautulliGraphsTab = lazy(() => import('./analytics/TautulliGraphsTab').then((module) => ({ default: module.TautulliGraphsTab })));
const UserAnalyticsModal = lazy(() => import('./analytics/UserAnalyticsModal').then((module) => ({ default: module.UserAnalyticsModal })));

const AnalyticsPanelFallback = () => <div className="min-h-[320px]" aria-hidden="true" />;

export const AnalyticsDashboard: React.FC<{ isAdmin: boolean; sessionInfo: any }> = ({ isAdmin, sessionInfo }) => {
    const [days, setDays] = useState('30');
    const [selectedUser, setSelectedUser] = useState<AnalyticsUser | null>(null);
    const [viewTab, setViewTab] = useState<AnalyticsViewTab>('overview');
    const mediaServerType = String(sessionInfo?.mediaServerType || 'plex').toLowerCase();
    const isJellyfinPortal = mediaServerType === 'jellyfin';
    const analyticsSourceLabel = isJellyfinPortal ? 'Jellystat' : 'Tautulli';
    const { analyticsData, providerData, isLoading, error } = useAnalyticsData({ days, isAdmin, isJellyfinPortal });

    useEffect(() => {
        if (isJellyfinPortal && viewTab === 'graphs') setViewTab('overview');
    }, [isJellyfinPortal, viewTab]);

    if (isLoading) return <Loader isLoading={true} />;
    if (error) return <div className="text-red-500 font-bold p-8 text-center">{error}</div>;
    if (!analyticsData) return null;

    return (
        <div className="w-full min-w-0 animate-fade-in flex flex-col gap-6">
            <AnalyticsDashboardHeader
                days={days}
                isJellyfinPortal={isJellyfinPortal}
                viewTab={viewTab}
                onDaysChange={setDays}
                onTabChange={setViewTab}
            />
            {viewTab === 'graphs' && (
                <Suspense fallback={<AnalyticsPanelFallback />}>
                    <TautulliGraphsTab />
                </Suspense>
            )}
            {viewTab === 'overview' && (
                <>
                    {analyticsData.cacheFallback && (
                        <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-200">
                            Analytics cache for this period is still building. Showing cached data from the last {analyticsData.cachePeriodDays} day period instead.
                        </div>
                    )}
                    <AnalyticsOverviewSection
                        compare={analyticsData.compare}
                        peakHours={analyticsData.peakHours}
                        topUsers={analyticsData.topUsers}
                        totalPlaybacks={analyticsData.totalPlaybacks}
                    />
                    {analyticsData.libraryHealth && <AnalyticsLibraryHealth libraryHealth={analyticsData.libraryHealth} />}
                    <AnalyticsChartsSection
                        analyticsData={analyticsData}
                        analyticsSourceLabel={analyticsSourceLabel}
                        isAdmin={isAdmin}
                        onUserClick={setSelectedUser}
                        providerData={providerData}
                    />
                </>
            )}
            {isAdmin && selectedUser && (
                <Suspense fallback={null}>
                    <UserAnalyticsModal
                        userId={selectedUser.id}
                        username={selectedUser.username}
                        thumb={selectedUser.thumb}
                        days={days}
                        onClose={() => setSelectedUser(null)}
                    />
                </Suspense>
            )}
        </div>
    );
};
