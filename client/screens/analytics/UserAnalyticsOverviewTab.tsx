import React from 'react';
import { Film, PlaySquare, TrendingUp } from 'lucide-react';

import { resolvePortalAssetUrl } from '../../shared/basePath';

type UserAnalyticsOverviewTabProps = {
    data: any;
};

export const UserAnalyticsOverviewTab: React.FC<UserAnalyticsOverviewTabProps> = ({ data }) => (
    <>
        <div>
            <h3 className="text-lg font-bold text-text mb-4 uppercase tracking-wider flex items-center gap-2"><PlaySquare className="text-plex w-4 h-4" /> Favorite Libraries</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
                {(data.topLibraries ?? []).length === 0 ? <p className="text-muted text-sm col-span-full">No library data.</p> : data.topLibraries.map((lib: any, i: number) => (
                    <div key={lib.id} className="flex justify-between items-center bg-black/20 p-2 rounded border border-white/5">
                        <span className="font-bold text-sm text-text"><span className="text-muted mr-2">#{i + 1}</span>{lib.title}</span>
                        <span className="text-plex text-xs font-mono">{lib.plays} plays</span>
                    </div>
                ))}
            </div>
        </div>

        {data.topMovies && data.topMovies.length > 0 && (
            <div>
                <h3 className="text-lg font-bold text-text mb-4 uppercase tracking-wider flex items-center gap-2"><Film className="text-plex w-4 h-4" /> Top Watched Movies</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
                    {data.topMovies.slice(0, 15).map((c: any) => (
                        <a key={c.key} href={c.plexUrl} target="_blank" rel="noreferrer" className="flex items-center gap-3 bg-black/20 p-2 rounded border border-white/5 hover:bg-white/10 transition-colors">
                            <div className="w-8 h-12 bg-black/40 rounded overflow-hidden flex-shrink-0 relative">
                                {c.thumbUrl && <img src={resolvePortalAssetUrl(c.thumbUrl)} className="w-full h-full object-cover" loading="lazy" decoding="async" onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.nextElementSibling?.classList.remove('hidden'); }} />}
                                <div className={`absolute inset-0 w-full h-full p-2 opacity-50 flex items-center justify-center ${c.thumbUrl ? 'hidden' : ''}`}>
                                    <Film className="w-full h-full" />
                                </div>
                            </div>
                            <div className="flex flex-col flex-grow overflow-hidden">
                                <span className="font-bold text-sm text-text truncate">{c.title}</span>
                                <span className="text-muted text-[10px] uppercase tracking-wider">{c.type}</span>
                            </div>
                            <span className="text-plex text-xs font-mono whitespace-nowrap">{c.plays} plays</span>
                        </a>
                    ))}
                </div>
            </div>
        )}

        {data.topShows && data.topShows.length > 0 && (
            <div>
                <h3 className="text-lg font-bold text-text mb-4 uppercase tracking-wider flex items-center gap-2"><TrendingUp className="text-plex w-4 h-4" /> Top Watched TV Shows</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
                    {data.topShows.slice(0, 15).map((c: any) => (
                        <a key={c.key} href={c.plexUrl} target="_blank" rel="noreferrer" className="flex items-center gap-3 bg-black/20 p-2 rounded border border-white/5 hover:bg-white/10 transition-colors">
                            <div className="w-8 h-12 bg-black/40 rounded overflow-hidden flex-shrink-0 relative">
                                {c.thumbUrl && <img src={resolvePortalAssetUrl(c.thumbUrl)} className="w-full h-full object-cover" loading="lazy" decoding="async" onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.nextElementSibling?.classList.remove('hidden'); }} />}
                                <div className={`absolute inset-0 w-full h-full p-2 opacity-50 flex items-center justify-center ${c.thumbUrl ? 'hidden' : ''}`}>
                                    <Film className="w-full h-full" />
                                </div>
                            </div>
                            <div className="flex flex-col flex-grow overflow-hidden">
                                <span className="font-bold text-sm text-text truncate">{c.title}</span>
                                <span className="text-muted text-[10px] uppercase tracking-wider">{c.type}</span>
                            </div>
                            <span className="text-plex text-xs font-mono whitespace-nowrap">{c.plays} plays</span>
                        </a>
                    ))}
                </div>
            </div>
        )}
    </>
);
