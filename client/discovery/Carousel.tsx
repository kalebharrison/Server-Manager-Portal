import React, { useRef, useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface CarouselProps {
    children: React.ReactNode;
}

/** Update chevron disabled state without re-rendering on every scroll frame. */
export const Carousel: React.FC<CarouselProps> = ({ children }) => {
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const atStartRef = useRef(true);
    const atEndRef = useRef(true);
    const rafRef = useRef(0);
    const [atStart, setAtStart] = useState(true);
    const [atEnd, setAtEnd] = useState(true);

    const syncEdges = useCallback(() => {
        const node = scrollContainerRef.current;
        if (!node) return;
        const { scrollLeft, scrollWidth, clientWidth } = node;
        const margin = 5;
        const canScroll = scrollWidth > clientWidth + margin;
        const nextStart = !canScroll || scrollLeft <= margin;
        const nextEnd = !canScroll || scrollLeft >= scrollWidth - clientWidth - margin;
        if (nextStart !== atStartRef.current) {
            atStartRef.current = nextStart;
            setAtStart(nextStart);
        }
        if (nextEnd !== atEndRef.current) {
            atEndRef.current = nextEnd;
            setAtEnd(nextEnd);
        }
    }, []);

    const handleScroll = useCallback(() => {
        if (rafRef.current) return;
        rafRef.current = window.requestAnimationFrame(() => {
            rafRef.current = 0;
            syncEdges();
        });
    }, [syncEdges]);

    useEffect(() => {
        syncEdges();
        const node = scrollContainerRef.current;
        if (!node) return undefined;

        const resizeObserver = typeof ResizeObserver !== 'undefined'
            ? new ResizeObserver(() => syncEdges())
            : null;
        resizeObserver?.observe(node);
        window.addEventListener('resize', syncEdges);

        const t = window.setTimeout(syncEdges, 100);

        return () => {
            resizeObserver?.disconnect();
            window.removeEventListener('resize', syncEdges);
            window.clearTimeout(t);
            if (rafRef.current) window.cancelAnimationFrame(rafRef.current);
        };
    }, [children, syncEdges]);

    const scroll = (direction: 'left' | 'right') => {
        if (!scrollContainerRef.current) return;
        const { clientWidth } = scrollContainerRef.current;
        const scrollAmount = direction === 'left' ? -clientWidth + 100 : clientWidth - 100;

        scrollContainerRef.current.scrollBy({
            left: scrollAmount,
            behavior: 'smooth',
        });
    };

    return (
        <div className="relative w-full min-w-0">
            {/* Chevrons sit on the section title row, top-right — no side gradients */}
            <div className="absolute right-1 -top-9 z-10 flex items-center text-muted">
                <button
                    type="button"
                    onClick={() => scroll('left')}
                    disabled={atStart}
                    className={`p-0.5 transition-colors ${atStart ? 'text-muted/30 cursor-default' : 'hover:text-text'}`}
                    aria-label="Scroll left"
                >
                    <ChevronLeft className="w-6 h-6" />
                </button>
                <button
                    type="button"
                    onClick={() => scroll('right')}
                    disabled={atEnd}
                    className={`p-0.5 transition-colors ${atEnd ? 'text-muted/30 cursor-default' : 'hover:text-text'}`}
                    aria-label="Scroll right"
                >
                    <ChevronRight className="w-6 h-6" />
                </button>
            </div>

            <div
                ref={scrollContainerRef}
                onScroll={handleScroll}
                className="flex gap-4 overflow-x-auto snap-x snap-proximity scrollbar-hide py-2 px-2 w-full poster-rail-scroll"
                style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            >
                {children}
            </div>
        </div>
    );
};
