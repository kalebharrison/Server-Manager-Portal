import React from 'react';
import { Eye, EyeOff } from 'lucide-react';

import {
    SECTION_PREVIEW_META,
    type DashboardLayoutConfig,
    type DashboardSectionId,
} from '../shared/dashboardLayout';

export const SectionVisibilityToggle: React.FC<{ visible: boolean; onToggle: () => void }> = ({ visible, onToggle }) => (
    <button
        type="button"
        onClick={(e) => {
            e.stopPropagation();
            onToggle();
        }}
        aria-pressed={visible}
        aria-label={visible ? 'Section shown on home page' : 'Section hidden on home page'}
        className={`inline-flex items-center gap-1.5 shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all
            ${visible
                ? 'bg-plex/15 border-plex/40 text-plex hover:bg-plex/25 shadow-[0_0_12px_rgba(229,160,13,0.12)]'
                : 'bg-white/5 border-border/50 text-muted hover:border-white/20 hover:text-text'
            }`}
    >
        {visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
        {visible ? 'Shown' : 'Hidden'}
    </button>
);

export const SectionPreview: React.FC<{ layout: DashboardLayoutConfig }> = ({ layout }) => (
    <div className="rounded-xl border border-border/50 bg-background/40 p-4 space-y-2">
        <p className="text-xs font-bold uppercase tracking-wider text-muted mb-3">Live preview</p>
        <div className="flex flex-col gap-2">
            {layout.sections.map((id) => {
                const meta = SECTION_PREVIEW_META[id];
                const hidden = layout.hiddenSections.includes(id);
                return (
                    <div
                        key={id}
                        className={`rounded-lg border transition-all ${hidden ? 'opacity-35 border-border/30 bg-white/[0.02]' : 'border-plex/40 bg-plex/[0.08] shadow-[0_0_16px_rgba(229,160,13,0.08)]'}`}
                    >
                        {id === 'mainGrid' && !hidden ? (
                            <div className={`${meta.previewClass} p-2 flex gap-2`}>
                                <div className="w-1/3 flex flex-col gap-1">
                                    <div className="flex-1 rounded bg-plex/20 border border-plex/30" title="Left column" />
                                    <div className="h-4 rounded bg-plex/15 border border-plex/25" />
                                </div>
                                <div className="w-2/3 flex flex-col gap-1">
                                    <div className="h-8 rounded bg-plex/20 border border-plex/30" />
                                    <div className="flex-1 rounded bg-plex/15 border border-plex/25" />
                                </div>
                            </div>
                        ) : id === 'watchRow' && !hidden ? (
                            <div className={`${meta.previewClass} p-2 flex gap-2`}>
                                <div className="w-1/3 rounded bg-plex/20 border border-plex/30" />
                                <div className="w-2/3 rounded bg-plex/15 border border-plex/25" />
                            </div>
                        ) : (
                            <div className={`${meta.previewClass} rounded bg-plex/15 border border-plex/25 mx-2 my-2`} />
                        )}
                        <div className="px-3 pb-2 flex items-center justify-between gap-2">
                            <div className="min-w-0">
                                <p className={`text-sm font-semibold truncate ${hidden ? 'text-muted line-through' : 'text-text'}`}>
                                    {meta.shortLabel}
                                </p>
                                <p className="text-[10px] text-muted truncate">{meta.description}</p>
                            </div>
                            {hidden && <span className="text-[10px] font-bold uppercase tracking-wider text-muted shrink-0">Hidden</span>}
                        </div>
                    </div>
                );
            })}
        </div>
        <p className="text-[10px] text-muted/80 pt-1">Hero banner stays at the top and is not configurable.</p>
    </div>
);

export type HomeLayoutSettingsProps = {
    layout: DashboardLayoutConfig;
    onChange: (layout: DashboardLayoutConfig) => void;
};

export type HomeLayoutSectionListProps = HomeLayoutSettingsProps & {
    dragIndex: number | null;
    dropIndex: number | null;
    setDragIndex: React.Dispatch<React.SetStateAction<number | null>>;
    setDropIndex: React.Dispatch<React.SetStateAction<number | null>>;
    onToggleSectionHidden: (sectionId: DashboardSectionId) => void;
    onDrop: (targetIndex: number) => void;
};
