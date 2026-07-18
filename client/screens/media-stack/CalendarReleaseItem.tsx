import React from 'react';
import { Clock, Film, Tv } from 'lucide-react';

import { formatTime } from '../../shared/format';

const mediaTypeLabel = (type: string) => type === 'tv' ? 'TV Show' : 'Movie';

export const CalendarReleaseItem: React.FC<{ item: any }> = ({ item }) => (
    <article
        className={`bg-card/80 hover:bg-card transition-colors rounded-xl p-3 flex gap-3 border-l-4 shadow-md min-w-0 ${item.hasFile ? 'border-l-green-500/80' : item.monitored ? 'border-l-red-500/80' : 'border-l-blue-500/80'} border-y border-r border-white/5 hover:border-white/20`}
    >
        <div className="w-14 sm:w-16 aspect-[2/3] rounded-lg overflow-hidden bg-background/70 border border-white/10 flex-shrink-0">
            {item.imageUrl ? (
                <img src={item.imageUrl} alt={item.title} className="w-full h-full object-cover" loading="lazy" decoding="async" />
            ) : (
                <div className="w-full h-full flex items-center justify-center text-muted/40">
                    {item.type === 'tv' ? <Tv className="w-6 h-6" /> : <Film className="w-6 h-6" />}
                </div>
            )}
        </div>
        <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 mb-1">
                <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border ${item.type === 'tv' ? 'text-sky-200 bg-sky-500/10 border-sky-500/20' : 'text-amber-200 bg-amber-500/10 border-amber-500/20'}`}>
                    {mediaTypeLabel(item.type)}
                </span>
                <span className="text-[11px] text-plex flex items-center gap-1 font-bold tracking-wide">
                    <Clock className="w-3.5 h-3.5" />
                    {formatTime(item.date).replace(/^0:/, '12:')}
                </span>
                {item.network && <span className="text-[10px] text-muted uppercase tracking-wider truncate max-w-[10rem]">{item.network}</span>}
            </div>
            <h4 className="font-bold text-sm md:text-base text-text leading-snug break-words line-clamp-2">{item.title}</h4>
            <p className="text-xs md:text-sm text-muted/85 line-clamp-2 mt-1 leading-relaxed">{item.subtitle}</p>
        </div>
        <div className="hidden sm:flex flex-col items-end gap-2 flex-shrink-0">
            {item.hasFile ? (
                <span className="text-[10px] font-bold text-green-400 bg-green-500/10 border border-green-500/20 rounded-md px-2 py-1 whitespace-nowrap">Ready</span>
            ) : item.monitored ? (
                <span className="text-[10px] font-bold text-plex bg-plex/10 border border-plex/20 rounded-md px-2 py-1 flex items-center gap-1.5 whitespace-nowrap">
                    <span className="w-1.5 h-1.5 rounded-full bg-plex animate-pulse" />
                    Monitored
                </span>
            ) : (
                <span className="text-[10px] font-bold text-muted bg-white/5 border border-white/10 rounded-md px-2 py-1 whitespace-nowrap">Unmonitored</span>
            )}
        </div>
    </article>
);
