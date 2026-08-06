import { lazy, memo, Suspense } from 'react';
import { MonitorSmartphone, PlaySquare } from 'lucide-react';

import { logoUrl, portalUrl, resolvePortalAssetUrl } from '../../shared/basePath';
import { AnalyticsTrendingContent } from './AnalyticsTrendingContent';
import type { AnalyticsData, ProviderAnalytics } from './useAnalyticsData';

const AnimatedLeaderboard = lazy(() => import('./AnimatedLeaderboard').then((module) => ({ default: module.AnimatedLeaderboard })));
const ServerInsightsWidget = lazy(() => import('./ServerInsightsWidget').then((module) => ({ default: module.ServerInsightsWidget })));

export type AnalyticsUser = { id: string; username: string; thumb: string | null };

const AnalyticsPanelFallback = ({ className = '' }: { className?: string }) => (
    <div className={`min-h-[320px] ${className}`} aria-hidden="true" />
);

const resolveUserAvatar = (thumb: string | null | undefined, width = 80, height = 80) => {
    if (!thumb) return logoUrl();
    if (thumb.startsWith('http://') || thumb.startsWith('https://') || thumb.startsWith('/api/')) {
        return resolvePortalAssetUrl(thumb);
    }
    return portalUrl(`/api/plex/image?path=${encodeURIComponent(thumb)}&width=${width}&height=${height}`);
};

export const AnalyticsChartsSection = memo(({
    analyticsData,
    isAdmin,
    onUserClick,
    providerData,
}: {
    analyticsData: AnalyticsData;
    isAdmin: boolean;
    onUserClick: (user: AnalyticsUser) => void;
    providerData: ProviderAnalytics | null;
}) => {
    const { topDevices, topLibraries, topMovies, topMusic, topShows, topUsers } = analyticsData;
    const maxLibraryPlays = Math.max(...topLibraries.map((library) => library.plays), 1);
    const maxDevicePlays = Math.max(...topDevices.map((device) => device.plays), 1);

    return (
        <>
            <div className="w-full">
                <Suspense fallback={<AnalyticsPanelFallback />}>
                    <AnimatedLeaderboard users={topUsers} resolveAvatar={resolveUserAvatar} isAdmin={isAdmin} onUserClick={onUserClick} />
                </Suspense>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <Suspense fallback={<AnalyticsPanelFallback className="lg:col-span-2" />}>
                    <ServerInsightsWidget
                        peakHours={analyticsData.peakHours || []}
                        tautulliData={providerData}
                        compare={analyticsData.compare}
                    />
                </Suspense>
                <div className="flex flex-col gap-6 lg:col-span-1">
                    <div className="glass-card-sm p-4 md:p-6">
                        <h2 className="text-xl font-bold text-text mb-4 uppercase tracking-wider flex items-center gap-2"><PlaySquare className="text-plex w-5 h-5" /> Popular Libraries</h2>
                        <div className="flex flex-col gap-5 mt-2">
                            {topLibraries.length === 0 ? <p className="text-muted text-sm">No data available.</p> : topLibraries.map((library, index) => (
                                <div key={library.id} className="flex flex-col gap-2">
                                    <div className="flex justify-between items-end">
                                        <span className="font-bold text-text flex items-center gap-2"><span className="text-muted text-xs">#{index + 1}</span> {library.title}</span>
                                        <span className="text-xs text-muted font-mono">{library.plays} plays</span>
                                    </div>
                                    <div className="h-2 w-full bg-black/40 rounded-full overflow-hidden">
                                        <div className="h-full bg-gradient-to-r from-plex to-[#e5a00d] rounded-full" style={{ width: `${(library.plays / maxLibraryPlays) * 100}%` }} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                    {topDevices.length > 0 && (
                        <div className="glass-card-sm p-4 md:p-6">
                            <h2 className="text-xl font-bold text-text mb-4 uppercase tracking-wider flex items-center gap-2"><MonitorSmartphone className="text-plex w-5 h-5" /> Top Devices</h2>
                            <div className="flex flex-col gap-4">
                                {topDevices.slice(0, 5).map((device, index) => (
                                    <div key={index} className="flex flex-col gap-1.5">
                                        <div className="flex justify-between items-end">
                                            <span className="font-bold text-sm text-text truncate pr-2 flex items-center gap-2"><span className="text-muted text-xs">#{index + 1}</span> {device.name || 'Unknown Device'}</span>
                                            <span className="text-xs text-muted font-mono flex-shrink-0">{device.plays} plays</span>
                                        </div>
                                        <div className="h-1.5 w-full bg-black/40 rounded-full overflow-hidden">
                                            <div className="h-full bg-gradient-to-r from-blue-600 to-blue-400 rounded-full shadow-[0_0_8px_rgba(59,130,246,0.5)] transition-all duration-1000" style={{ width: `${(device.plays / Math.max(maxDevicePlays, 1)) * 100}%` }} />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
                <AnalyticsTrendingContent movies={topMovies} shows={topShows} music={topMusic} />
            </div>
        </>
    );
});

AnalyticsChartsSection.displayName = 'AnalyticsChartsSection';
