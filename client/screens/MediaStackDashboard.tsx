import React from 'react';
import { Calendar } from 'lucide-react';

import { Loader } from '../shared/toast';
import { MediaStackCalendarPanel } from './media-stack/MediaStackCalendarPanel';
import { useMediaStackDashboard } from './media-stack/useMediaStackDashboard';

export const MediaStackDashboard: React.FC<{ cacheMinutes?: number }> = ({ cacheMinutes }) => {
    const dashboard = useMediaStackDashboard({ cacheMinutes });

    if (dashboard.isLoading) return <Loader isLoading={true} />;
    if (dashboard.error) return <div className="text-center p-8 text-status-expiring">{dashboard.error}</div>;
    if (!dashboard.calendarData) return null;

    return (
        <div className="w-full animate-fade-in flex flex-col gap-6">
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-2">
                <div>
                    <h1 className="text-3xl font-bold text-text uppercase tracking-widest flex items-center gap-3">
                        <Calendar className="w-8 h-8 text-plex" />
                        Release Calendar
                    </h1>
                    <p className="text-muted text-sm mt-1">TV and movie release schedule.</p>
                </div>
            </div>

            <MediaStackCalendarPanel {...dashboard} />
        </div>
    );
};
