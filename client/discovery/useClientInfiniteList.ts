import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DISCOVER_LOAD_MORE_TARGET } from './discoverPaginationUtils';

/** Client-side infinite scroll for finite in-memory lists (community stats, etc.). */
export function useClientInfiniteList<T>(items: T[], resetKey: string) {
    const [visibleCount, setVisibleCount] = useState(DISCOVER_LOAD_MORE_TARGET);
    const sentinelRef = useRef<HTMLDivElement>(null);
    const allItems = useMemo(() => (Array.isArray(items) ? items : []), [items]);

    useEffect(() => {
        setVisibleCount(DISCOVER_LOAD_MORE_TARGET);
    }, [resetKey, allItems]);

    const results = allItems.slice(0, visibleCount);
    const hasMore = visibleCount < allItems.length;
    const loading = false;
    const loadingMore = false;

    const loadMore = useCallback(() => {
        setVisibleCount((current) => Math.min(allItems.length, current + DISCOVER_LOAD_MORE_TARGET));
    }, [allItems.length]);

    useEffect(() => {
        if (!hasMore) return undefined;
        const node = sentinelRef.current;
        if (!node) return undefined;
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries.some((entry) => entry.isIntersecting)) loadMore();
            },
            { root: null, rootMargin: '600px 0px 400px 0px', threshold: 0.01 },
        );
        observer.observe(node);
        return () => observer.disconnect();
    }, [hasMore, loadMore, results.length]);

    return {
        results,
        loading,
        loadingMore,
        hasMore,
        sentinelRef,
    };
}
