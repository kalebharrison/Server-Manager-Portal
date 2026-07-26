import { useEffect, useState } from 'react';

/** Matches MainApp ultra-wide content cap (16:9 of screen height). */
export const PORTAL_WIDE_LAYOUT_THRESHOLD = (16 / 9) + 0.03;

export const isPortalWideContentLayout = () => {
    const screenWidth = window.screen?.width || window.innerWidth;
    const screenHeight = window.screen?.height || window.innerHeight;
    return screenWidth / Math.max(1, screenHeight) > PORTAL_WIDE_LAYOUT_THRESHOLD;
};

export const usePortalWideContentLayout = () => {
    const [isWide, setIsWide] = useState(() =>
        typeof window !== 'undefined' ? isPortalWideContentLayout() : false
    );

    useEffect(() => {
        const update = () => setIsWide(isPortalWideContentLayout());
        update();
        window.addEventListener('resize', update);
        return () => window.removeEventListener('resize', update);
    }, []);

    return isWide;
};

export const activityStreamColumnCount = (wideLayout: boolean, sessionCount: number) =>
    wideLayout && sessionCount >= 4 ? 4 : 3;

export const activityStreamGridClass = (wideLayout: boolean, sessionCount: number) => {
    const useFourCols = activityStreamColumnCount(wideLayout, sessionCount) === 4;
    return useFourCols ? 'discover-activity-grid discover-activity-grid--quad' : 'discover-activity-grid';
};

/** Auto-wrapping poster grid sized to the content area, not the viewport. */
export const discoverPosterGridClass = 'discover-poster-grid';

export type UpgraderGridSize = 'small' | 'medium' | 'large' | 'list';
export const UPGRADER_GRID_SIZE_STORAGE_KEY = 'upgrader_grid_size';
export const UPGRADER_GRID_SIZE_OPTIONS = [
    { value: 'small', label: 'Small grid' },
    { value: 'medium', label: 'Medium grid' },
    { value: 'large', label: 'Large grid' },
    { value: 'list', label: 'List' },
];
export const normalizeUpgraderGridSize = (value: string | null): UpgraderGridSize => (
    ['small', 'medium', 'large', 'list'].includes(String(value)) ? value as UpgraderGridSize : 'medium'
);
export const upgraderPosterGridClass = (size: UpgraderGridSize) => (
    size === 'list' ? 'grid grid-cols-1 gap-3' : 'grid gap-4'
);
export const upgraderPosterGridStyle = (size: UpgraderGridSize) => (
    size === 'list' ? undefined : { gridTemplateColumns: `repeat(auto-fill, minmax(${size === 'small' ? 120 : size === 'large' ? 220 : 165}px, 1fr))` }
);
