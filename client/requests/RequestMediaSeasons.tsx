import React from 'react';
import { Check } from 'lucide-react';

import { DetailSection } from './RequestMediaDetails';
import type { RequestSeason } from './types';

export const RequestMediaSeasons: React.FC<{
    seasons: RequestSeason[];
    requestableSeasons: RequestSeason[];
    selectedSeasons: number[];
    canRequest: boolean;
    onSelectAll: () => void;
    onToggle: (seasonNumber: number) => void;
}> = ({ seasons, requestableSeasons, selectedSeasons, canRequest, onSelectAll, onToggle }) => (
    <DetailSection title="Seasons" className="mb-7">
        {canRequest && requestableSeasons.length > 0 ? (
            <div className="mb-3 flex items-center justify-between gap-3">
                <p className="text-sm text-muted">Choose which seasons to request.</p>
                <button type="button" onClick={onSelectAll} className="text-xs font-semibold text-plex hover:text-plex-hover">
                    Select all
                </button>
            </div>
        ) : null}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {seasons
                .filter((season) => season.seasonNumber > 0)
                .map((season) => {
                    const requestable = requestableSeasons.some((entry) => entry.seasonNumber === season.seasonNumber);
                    const checked = selectedSeasons.includes(season.seasonNumber);
                    return (
                        <button
                            key={season.seasonNumber}
                            type="button"
                            disabled={!canRequest || !requestable}
                            onClick={() => onToggle(season.seasonNumber)}
                            className={`flex items-center justify-between gap-3 rounded-xl border p-3 text-left transition-colors disabled:cursor-default disabled:opacity-70 ${checked ? 'border-plex bg-plex/10 text-text' : 'border-border bg-background/35 text-muted hover:text-text hover:bg-white/5'}`}
                        >
                            <span className="min-w-0">
                                <span className="block text-sm font-bold line-clamp-1">{season.name}</span>
                                <span className="block text-xs opacity-75">{season.episodeCount || 0} episodes{season.statusLabel ? ` - ${season.statusLabel}` : ''}</span>
                            </span>
                            <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${checked ? 'border-plex bg-plex text-background' : 'border-border'}`}>
                                {checked && <Check className="h-3 w-3" />}
                            </span>
                        </button>
                    );
                })}
        </div>
    </DetailSection>
);
