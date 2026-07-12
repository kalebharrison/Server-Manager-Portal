import React from 'react';

const pulse = 'skeleton-base';

export const SkeletonBlock: React.FC<{ className?: string }> = ({ className = '' }) => (
    <div className={`${pulse} rounded ${className}`} aria-hidden="true" />
);

export const LibraryStatsSkeleton: React.FC = () => (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4" aria-hidden="true">
        {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="bg-background/60 p-4 rounded-2xl border border-white/5 flex flex-col items-center gap-3">
                <SkeletonBlock className="w-7 h-7 rounded" />
                <SkeletonBlock className="h-8 w-20 rounded" />
                <SkeletonBlock className="h-3 w-24 rounded" />
            </div>
        ))}
    </div>
);

export const WrapUpCardsSkeleton: React.FC = () => (
    <div className="glass-card p-4 md:p-5 shadow-xl" aria-busy="true" aria-label="Loading personal wrap-up">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3 md:mb-4">
            <SkeletonBlock className="h-6 w-48 rounded" />
            <SkeletonBlock className="h-9 w-32 rounded-lg" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2.5 md:gap-3" aria-hidden="true">
            {Array.from({ length: 10 }, (_, i) => (
                <SkeletonBlock key={i} className="rounded-xl min-h-[112px]" />
            ))}
        </div>
    </div>
);

export const TopWatchedGridSkeleton: React.FC = () => (
    <div className="glass-card flex-1 flex flex-col h-full w-full min-h-0 p-4 md:p-5 shadow-xl" aria-busy="true" aria-label="Loading analytics">
        <div className="mb-3 md:mb-4">
            <SkeletonBlock className="h-6 w-40 rounded mb-2" />
            <SkeletonBlock className="h-4 w-56 rounded" />
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2.5 md:gap-3.5 flex-1 content-start" aria-hidden="true">
            {Array.from({ length: 18 }, (_, i) => (
                <div key={i} className="flex flex-col gap-1.5">
                    <SkeletonBlock className="aspect-[2/3] w-full rounded-lg" />
                    <SkeletonBlock className="h-2.5 w-full rounded" />
                </div>
            ))}
        </div>
    </div>
);
