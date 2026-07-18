import { Suspense, lazy, memo, useState } from 'react';

import { PeriodDropdown } from '../../shared/PeriodDropdown';
import { WrapUpCardGrid } from '../../shared/WrapUpCards';
import { wrapUpDaysOptions } from './userDashboardUtils';

const WrapUpModal = lazy(() => import('./WrapUpModal').then(module => ({ default: module.WrapUpModal })));

type Props = {
    analytics: any;
    analyticsDays: number | 'all';
    analyticsError: string | null;
    analyticsLoading: boolean;
    canShowAnalytics: boolean;
    onAnalyticsDaysChange: (days: number | 'all') => void;
};

export const HomeWrapUpSection = memo<Props>(({
    analytics,
    analyticsDays,
    analyticsError,
    analyticsLoading,
    canShowAnalytics,
    onAnalyticsDaysChange,
}) => {
    const [daysOpen, setDaysOpen] = useState(false);
    const [selectedMetric, setSelectedMetric] = useState<string | null>(null);

    return (
        <>
            {canShowAnalytics && !analyticsLoading && analyticsError && (
                <div className="glass-card p-4 md:p-5 shadow-xl border border-red-500/30 bg-red-500/5">
                    <p className="text-red-300 text-sm font-medium">{analyticsError}</p>
                </div>
            )}
            {canShowAnalytics && !analyticsLoading && analytics && (
                <div className="glass-card p-4 md:p-5 shadow-xl">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3 md:mb-4">
                        <h3 className="text-xl font-bold text-text">Your Personal Wrap-Up</h3>
                        <div className="flex items-center gap-2">
                            <PeriodDropdown
                                value={analyticsDays}
                                open={daysOpen}
                                onToggle={() => setDaysOpen(current => !current)}
                                onClose={() => setDaysOpen(false)}
                                onChange={(value) => onAnalyticsDaysChange(value as number | 'all')}
                                options={wrapUpDaysOptions}
                                buttonClassName="flex items-center gap-2 bg-background border border-border/50 rounded-lg px-3 py-1.5 text-sm font-medium text-text focus:outline-none hover:border-plex/50 transition-colors cursor-pointer shadow-sm"
                            />
                        </div>
                    </div>
                    <WrapUpCardGrid analytics={analytics} interactive onCardClick={setSelectedMetric} minCardHeight={112} />
                </div>
            )}

            {selectedMetric && analytics && (
                <Suspense fallback={null}>
                    <WrapUpModal metric={selectedMetric} analytics={analytics} days={analyticsDays} onClose={() => setSelectedMetric(null)} />
                </Suspense>
            )}
        </>
    );
});

HomeWrapUpSection.displayName = 'HomeWrapUpSection';
