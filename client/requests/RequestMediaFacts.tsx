import React from 'react';
import { CalendarDays, Check, Clock3, Film, Globe2, Star, Tv } from 'lucide-react';

import { DetailSection, formatDate, formatLanguage, formatMoney, formatRuntime } from './RequestMediaDetails';
import type { RequestMediaItem } from './types';

export const RequestMediaFacts: React.FC<{ detail: RequestMediaItem }> = ({ detail }) => {
    const isTv = detail.mediaType === 'tv';
    const releaseLabel = formatDate(detail.releaseDate || detail.firstAirDate);
    const runtimeLabel = formatRuntime(detail.runtime);
    const facts = [
        detail.rating ? { label: 'Rating', value: `${detail.rating.toFixed(1)} / 10`, icon: Star } : null,
        releaseLabel ? { label: 'Release', value: releaseLabel, icon: CalendarDays } : null,
        runtimeLabel ? { label: isTv ? 'Episode Runtime' : 'Runtime', value: runtimeLabel, icon: Clock3 } : null,
        detail.status ? { label: 'Status', value: detail.status, icon: Check } : null,
        detail.originalLanguage ? { label: 'Language', value: formatLanguage(detail.originalLanguage), icon: Globe2 } : null,
        detail.network ? { label: 'Network', value: detail.network, icon: Tv } : null,
        detail.studio ? { label: 'Studio', value: detail.studio, icon: Film } : null,
        detail.numberOfSeasons ? { label: 'Seasons', value: String(detail.numberOfSeasons), icon: Tv } : null,
        detail.numberOfEpisodes ? { label: 'Episodes', value: String(detail.numberOfEpisodes), icon: Film } : null,
        detail.lastAirDate ? { label: 'Last Aired', value: formatDate(detail.lastAirDate), icon: CalendarDays } : null,
        detail.nextAirDate ? { label: 'Next Airs', value: formatDate(detail.nextAirDate), icon: CalendarDays } : null,
        detail.budget ? { label: 'Budget', value: formatMoney(detail.budget), icon: Film } : null,
        detail.revenue ? { label: 'Revenue', value: formatMoney(detail.revenue), icon: Film } : null,
    ].filter(Boolean) as Array<{ label: string; value: string | null; icon: React.ElementType }>;

    if (!facts.length) return null;
    return (
        <DetailSection title="Details" className="mb-7">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
                {facts.map((fact) => {
                    const Icon = fact.icon;
                    return (
                        <div key={`${fact.label}-${fact.value}`} className="rounded-xl border border-white/10 bg-background/35 p-3">
                            <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted">
                                <Icon className="h-3.5 w-3.5 text-plex" />
                                {fact.label}
                            </div>
                            <div className="text-sm font-bold text-text">{fact.value}</div>
                        </div>
                    );
                })}
            </div>
        </DetailSection>
    );
};
