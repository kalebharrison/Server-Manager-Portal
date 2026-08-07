/** Shared QC dashboard chrome — align with Analytics / glass-card pages. */

export const QC_SECTION = 'glass-card-sm p-4 md:p-5';
export const QC_SECTION_FLUSH = 'glass-card-sm overflow-hidden';
export const QC_KPI = 'glass-card-sm px-3 py-3';
export const QC_TAB_BAR = 'flex bg-black/40 rounded-lg p-1 border border-white/5 w-fit max-w-full overflow-x-auto hide-scrollbar';
export const QC_PAGE = 'w-full min-w-0 animate-fade-in flex flex-col gap-6';

export const qcTabButtonClass = (active: boolean) => (
    `px-3 md:px-4 py-2 rounded-md text-xs md:text-sm font-bold uppercase tracking-wider transition-colors inline-flex items-center gap-1.5 md:gap-2 shrink-0 ${
        active ? 'bg-plex text-white shadow-lg' : 'text-muted hover:text-white'
    }`
);
