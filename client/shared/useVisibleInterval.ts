import { useEffect, useRef } from 'react';

/**
 * Runs `callback` on an interval while the document is visible.
 * Skips ticks when the tab is hidden or a previous invocation is still in flight.
 */
export const useVisibleInterval = (callback: () => void | Promise<void>, delayMs: number) => {
    const callbackRef = useRef(callback);
    const inFlightRef = useRef(false);

    useEffect(() => {
        callbackRef.current = callback;
    }, [callback]);

    useEffect(() => {
        if (!Number.isFinite(delayMs) || delayMs <= 0) return undefined;

        const tick = async () => {
            if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
            if (inFlightRef.current) return;
            inFlightRef.current = true;
            try {
                await callbackRef.current();
            } finally {
                inFlightRef.current = false;
            }
        };

        const id = window.setInterval(() => {
            void tick();
        }, delayMs);

        const onVisibility = () => {
            if (document.visibilityState === 'visible') void tick();
        };
        document.addEventListener('visibilitychange', onVisibility);

        return () => {
            window.clearInterval(id);
            document.removeEventListener('visibilitychange', onVisibility);
        };
    }, [delayMs]);
};
