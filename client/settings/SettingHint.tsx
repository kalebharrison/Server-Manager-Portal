import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const POPOVER_WIDTH = 320;
const VIEWPORT_PAD = 12;

type PopoverPos = { top: number; left: number; width: number };

export const SettingHint: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const detailsRef = useRef<HTMLDetailsElement>(null);
    const summaryRef = useRef<HTMLElement>(null);
    const popoverRef = useRef<HTMLDivElement>(null);
    const [open, setOpen] = useState(false);
    const [pos, setPos] = useState<PopoverPos | null>(null);

    const placePopover = () => {
        const anchor = summaryRef.current;
        if (!anchor) return;
        const rect = anchor.getBoundingClientRect();
        const width = Math.min(POPOVER_WIDTH, window.innerWidth - VIEWPORT_PAD * 2);
        let left = rect.left;
        if (left + width > window.innerWidth - VIEWPORT_PAD) {
            left = rect.right - width;
        }
        left = Math.max(VIEWPORT_PAD, left);
        setPos({
            top: rect.bottom + 8,
            left,
            width,
        });
    };

    useLayoutEffect(() => {
        if (!open) {
            setPos(null);
            return;
        }
        placePopover();
        const onReposition = () => placePopover();
        window.addEventListener('resize', onReposition);
        window.addEventListener('scroll', onReposition, true);
        return () => {
            window.removeEventListener('resize', onReposition);
            window.removeEventListener('scroll', onReposition, true);
        };
    }, [open]);

    useEffect(() => {
        const handleOutsideClick = (event: MouseEvent) => {
            if (!detailsRef.current?.open) return;
            const target = event.target as Node;
            if (detailsRef.current.contains(target)) return;
            if (popoverRef.current?.contains(target)) return;
            detailsRef.current.open = false;
            setOpen(false);
        };
        const handleEscape = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;
            if (detailsRef.current?.open) {
                detailsRef.current.open = false;
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', handleOutsideClick);
        document.addEventListener('keydown', handleEscape);
        return () => {
            document.removeEventListener('mousedown', handleOutsideClick);
            document.removeEventListener('keydown', handleEscape);
        };
    }, []);

    return (
        <details
            ref={detailsRef}
            className="relative inline-block ml-2 mt-0.5"
            onToggle={(event) => setOpen((event.currentTarget as HTMLDetailsElement).open)}
        >
            <summary
                ref={summaryRef}
                className="list-none inline-flex items-center gap-1 cursor-pointer text-xs text-plex hover:text-plex-hover font-semibold select-none"
            >
                <span className="inline-flex items-center justify-center w-4 h-4 rounded-full border border-plex/60 text-[10px] leading-none">?</span>
                Hint
            </summary>
            {open && pos && createPortal(
                <div
                    ref={popoverRef}
                    role="tooltip"
                    className="fixed z-[9999] bg-card border border-border rounded-lg px-3 py-2 text-xs text-muted shadow-xl"
                    style={{ top: pos.top, left: pos.left, width: pos.width }}
                >
                    {children}
                </div>,
                document.body,
            )}
        </details>
    );
};
