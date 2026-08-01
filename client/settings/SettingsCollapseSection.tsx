import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';

type Props = {
    title: React.ReactNode;
    subtitle?: React.ReactNode;
    /** Optional control rendered on the right of the header (e.g. Add button). */
    headerRight?: React.ReactNode;
    defaultOpen?: boolean;
    className?: string;
    children: React.ReactNode;
};

/** Collapsible settings block — keeps long admin pages scannable. */
export const SettingsCollapseSection: React.FC<Props> = ({
    title,
    subtitle,
    headerRight,
    defaultOpen = false,
    className = '',
    children,
}) => {
    const [open, setOpen] = useState(defaultOpen);

    return (
        <section className={`rounded-xl border border-border/60 bg-surface/20 overflow-hidden ${className}`}>
            <div className="flex items-stretch gap-2">
                <button
                    type="button"
                    onClick={() => setOpen((value) => !value)}
                    aria-expanded={open}
                    className="flex-1 flex items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.03] transition-colors min-w-0"
                >
                    <ChevronDown
                        className={`w-4 h-4 text-muted shrink-0 transition-transform ${open ? 'rotate-0' : '-rotate-90'}`}
                    />
                    <div className="min-w-0 flex-1">
                        {typeof title === 'string' || typeof title === 'number' ? (
                            <div className="text-base font-bold text-text leading-tight">{title}</div>
                        ) : (
                            title
                        )}
                        {subtitle ? <div className="text-xs text-muted mt-0.5">{subtitle}</div> : null}
                    </div>
                </button>
                {headerRight ? (
                    <div className="flex items-center pr-3 shrink-0" onClick={(e) => e.stopPropagation()}>
                        {headerRight}
                    </div>
                ) : null}
            </div>
            {open ? (
                <div className="px-4 pb-4 pt-1 border-t border-border/40">
                    {children}
                </div>
            ) : null}
        </section>
    );
};
