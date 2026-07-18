import React from 'react';
import { Activity, Film, Music, Search } from 'lucide-react';

import { resolvePortalAssetUrl } from '../../shared/basePath';
import { Loader } from '../../shared/toast';

type UserAnalyticsHistoryTabProps = {
    historySearch: string;
    handleSearch: (e: React.ChangeEvent<HTMLInputElement>) => void;
    historyLoading: boolean;
    historyData: any[];
    historyTotal: number;
    historyPage: number;
    setHistoryPage: React.Dispatch<React.SetStateAction<number>>;
};

export const UserAnalyticsHistoryTab: React.FC<UserAnalyticsHistoryTabProps> = ({
    historySearch,
    handleSearch,
    historyLoading,
    historyData,
    historyTotal,
    historyPage,
    setHistoryPage,
}) => (
    <div className="flex flex-col gap-4 h-full min-h-[400px]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <h3 className="text-lg font-bold text-text uppercase tracking-wider flex items-center gap-2"><Activity className="text-plex w-4 h-4" /> Full Watch History</h3>
            <div className="relative w-full sm:w-64">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-muted" />
                <input
                    type="text"
                    placeholder="Search history..."
                    value={historySearch}
                    onChange={handleSearch}
                    className="w-full bg-black/40 border border-border text-white text-sm rounded-lg focus:ring-plex focus:border-plex block pl-10 p-2 transition-colors"
                />
            </div>
        </div>

        <div className="flex-1 overflow-y-auto bg-black/20 rounded-xl border border-white/5 p-2 custom-scrollbar">
            {historyLoading ? (
                <div className="flex justify-center items-center h-40"><Loader isLoading={true} /></div>
            ) : historyData.length === 0 ? (
                <div className="flex justify-center items-center h-40 text-muted">No history found.</div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {historyData.map((h: any, i: number) => (
                        <div key={i} className="flex items-center gap-3 bg-white/5 border border-white/5 p-2 rounded-lg hover:bg-white/10 transition-colors">
                            <div className={`${h.type === 'track' ? 'w-12 h-12' : 'w-10 h-14'} bg-black/40 rounded overflow-hidden flex-shrink-0`}>
                                {h.thumbUrl && <img src={resolvePortalAssetUrl(h.thumbUrl)} className="w-full h-full object-cover" loading="lazy" decoding="async" onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.nextElementSibling?.classList.remove('hidden'); }} />}
                                <div className={`w-full h-full p-2 opacity-50 flex items-center justify-center ${h.thumbUrl ? 'hidden' : ''}`}>
                                    {h.type === 'track' ? <Music className="w-full h-full" /> : <Film className="w-full h-full" />}
                                </div>
                            </div>
                            <div className="flex flex-col overflow-hidden w-full">
                                <span className="font-bold text-sm text-text truncate w-[95%]">{h.title}</span>
                                {h.parentTitle && h.type !== 'movie' && <span className="text-muted text-xs truncate w-[95%]">{h.parentTitle}</span>}
                                <div className="flex items-center gap-2 mt-1">
                                    <span className="text-plex font-mono text-[10px]">
                                        {h.viewedAt ? (h.viewedAt > 9999999999 ? new Date(h.viewedAt).toLocaleString() : new Date(h.viewedAt * 1000).toLocaleString()) : 'Unknown Date'}
                                    </span>
                                    {h.percentComplete != null && h.percentComplete < 100 && (
                                        <span className="text-yellow-500 font-mono text-[10px]">{h.percentComplete}%</span>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>

        {historyTotal > 15 && (
            <div className="flex justify-between items-center pt-2 border-t border-border mt-2 flex-shrink-0">
                <span className="text-sm text-muted">Showing {Math.min((historyPage - 1) * 15 + 1, historyTotal)} to {Math.min(historyPage * 15, historyTotal)} of {historyTotal} plays</span>
                <div className="flex gap-2">
                    <button type="button" disabled={historyPage === 1} onClick={() => setHistoryPage(p => p - 1)} className="bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white/10 px-3 py-1.5 rounded-lg text-sm text-white font-bold transition-colors">Prev</button>
                    <button type="button" disabled={historyPage * 15 >= historyTotal} onClick={() => setHistoryPage(p => p + 1)} className="bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white/10 px-3 py-1.5 rounded-lg text-sm text-white font-bold transition-colors">Next</button>
                </div>
            </div>
        )}
    </div>
);
