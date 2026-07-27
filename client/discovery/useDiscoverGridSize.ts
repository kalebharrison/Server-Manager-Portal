import { useEffect, useState } from 'react';
import type { UpgraderGridSize } from '../shared/portalLayout';

export const DISCOVERY_GRID_SIZE_STORAGE_KEY = 'discoveryGridSize';

/** Discover only supports large/xlarge — small/medium crush dense cards. */
export const normalizeDiscoverGridSize = (value: unknown): UpgraderGridSize => {
    if (value === 'xlarge') return 'xlarge';
    return 'large';
};

export const useDiscoverGridSize = () => {
    const [gridSize, setGridSize] = useState<UpgraderGridSize>(() => {
        if (typeof window === 'undefined') return 'large';
        return normalizeDiscoverGridSize(
            window.localStorage.getItem(DISCOVERY_GRID_SIZE_STORAGE_KEY) || 'large',
        );
    });

    useEffect(() => {
        const next = normalizeDiscoverGridSize(gridSize);
        if (next !== gridSize) {
            setGridSize(next);
            return;
        }
        window.localStorage.setItem(DISCOVERY_GRID_SIZE_STORAGE_KEY, next);
    }, [gridSize]);

    return [gridSize, setGridSize] as const;
};
