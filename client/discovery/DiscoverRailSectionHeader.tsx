import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { discoveryTheme } from './discoveryThemeClasses';
import type { RailMediaFilter } from './discoverRailBrowse';

type Props = {
    title: string;
    viewAllLabel?: string;
    showMediaPicker?: boolean;
    onNavigate: (media: RailMediaFilter) => void;
    defaultMedia?: RailMediaFilter;
};

export const DiscoverRailSectionHeader: React.FC<Props> = ({
    title,
    viewAllLabel,
    showMediaPicker = false,
    onNavigate,
    defaultMedia = 'movie',
}) => {
    const [open, setOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return undefined;
        const onDoc = (event: MouseEvent) => {
            if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', onDoc);
        return () => document.removeEventListener('mousedown', onDoc);
    }, [open]);

    const pick = (media: RailMediaFilter) => {
        setOpen(false);
        onNavigate(media);
    };

    const openPicker = () => {
        if (showMediaPicker) setOpen((value) => !value);
        else onNavigate(defaultMedia);
    };

    return (
        <div ref={rootRef} className="relative flex items-center gap-3 min-w-0 px-2 pr-16">
            <button
                type="button"
                onClick={openPicker}
                className={`${discoveryTheme.sectionTitle} truncate text-left hover:text-plex transition-colors inline-flex items-center gap-1 max-w-full`}
            >
                <span className="truncate">{title}</span>
                {showMediaPicker ? <ChevronDown className={`w-4 h-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} /> : null}
            </button>
            {viewAllLabel ? (
                <button
                    type="button"
                    onClick={() => pick(defaultMedia)}
                    className="shrink-0 text-xs font-bold text-plex hover:underline"
                >
                    {viewAllLabel}
                </button>
            ) : null}
            {open && showMediaPicker ? (
                <div className="absolute left-2 top-full z-30 mt-1 min-w-[10rem] rounded-lg border border-border bg-card shadow-xl py-1">
                    {([
                        ['movie', 'Movies'],
                        ['tv', 'TV'],
                        ['all', 'Movies & TV'],
                    ] as const).map(([media, label]) => (
                        <button
                            key={media}
                            type="button"
                            onClick={() => pick(media)}
                            className="w-full text-left px-3 py-2 text-sm font-semibold text-text hover:bg-white/5 hover:text-plex transition-colors"
                        >
                            {label}
                        </button>
                    ))}
                </div>
            ) : null}
        </div>
    );
};
