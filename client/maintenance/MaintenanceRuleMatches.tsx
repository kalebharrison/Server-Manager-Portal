import React from 'react';
import type { MaintenancePreview } from './maintenanceRuleModels';

export const MaintenanceRuleMatches: React.FC<{
    selectedRuleId: string | null;
    preview: MaintenancePreview | null;
}> = ({ selectedRuleId, preview }) => (
    <div className="glass-card-sm p-4">
        <div className="flex items-center justify-between mb-3">
            <h4 className="font-bold text-text">Matched Titles</h4>
            <div className="text-right">
                <span className="text-xs px-2 py-1 rounded bg-plex/20 text-plex font-semibold">{preview?.totalMatches || 0} matches</span>
                {preview && (
                    <p className="text-[11px] text-muted mt-1">
                        {(preview.graceRemainingDays ?? 0) > 0
                            ? `All in grace (${preview.graceRemainingDays} day(s) remaining)`
                            : `${preview.eligibleCount ?? 0} eligible · ${preview.actionableCount ?? 0} in Sonarr/Radarr · up to ${preview.wouldProcessCount ?? 0} per run`}
                    </p>
                )}
            </div>
        </div>
        {!selectedRuleId ? (
            <p className="text-sm text-muted">Select a saved filter to preview matches.</p>
        ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-7 xl:grid-cols-8 gap-3 max-h-[640px] overflow-y-auto custom-scrollbar pr-1">
                {(preview?.sample || []).map((item) => (
                    <div key={`${selectedRuleId}-${item.ratingKey}`} className="bg-background/30 border border-white/5 rounded-lg overflow-hidden">
                        <div className="aspect-[2/3] bg-black/40">
                            {item.thumb ? (
                                <img
                                    src={`/api/plex/image?path=${encodeURIComponent(item.thumb)}&width=240&height=360`}
                                    alt={item.title}
                                    loading="lazy"
                                    className="w-full h-full object-cover"
                                />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center text-xs text-muted">No Poster</div>
                            )}
                        </div>
                        <div className="p-2">
                            <p className="text-xs text-text line-clamp-2">{item.title}</p>
                            <p className="text-[11px] text-muted mt-1">{item.libraryTitle || item.mediaType}</p>
                            <div className="flex flex-wrap gap-1 mt-1">
                                {item.eligible === false && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300">Grace</span>}
                                {item.arrResolvable ? (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/15 text-green-300">{item.arrType || 'ARR'}</span>
                                ) : item.eligible !== false ? (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/15 text-red-300">Unmapped</span>
                                ) : null}
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        )}
    </div>
);
