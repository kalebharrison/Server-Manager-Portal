import React from 'react';
import { AlertCircle, X } from 'lucide-react';

import { logoUrl, portalUrl } from '../../shared/basePath';
import { Loader } from '../../shared/toast';
import { UserAnalyticsGraphsTab } from './UserAnalyticsGraphsTab';
import { UserAnalyticsHistoryTab } from './UserAnalyticsHistoryTab';
import { UserAnalyticsOverviewTab } from './UserAnalyticsOverviewTab';
import { useUserAnalyticsModal } from './useUserAnalyticsModal';

export const UserAnalyticsModal: React.FC<{ userId: string, username: string, thumb: string | null, days: string, onClose: () => void }> = ({ userId, username, thumb, days, onClose }) => {
    const {
        data,
        loading,
        error,
        activeTab,
        setActiveTab,
        historyPage,
        setHistoryPage,
        historySearch,
        historyData,
        historyTotal,
        historyLoading,
        handleSearch,
    } = useUserAnalyticsModal(userId, days);

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in" onClick={onClose}>
            <div className="bg-card/90 border border-border w-full max-w-6xl max-h-[90vh] rounded-2xl shadow-2xl overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="p-6 border-b border-border flex items-center justify-between bg-black/20 flex-shrink-0">
                    <div className="flex items-center gap-4">
                        <div className="w-16 h-16 rounded-full p-[2px] bg-gradient-to-r from-plex to-[#e5a00d]">
                            <img src={thumb ? (thumb.startsWith('http') ? thumb : portalUrl(`/api/plex/image?path=${encodeURIComponent(thumb)}&width=128&height=128`)) : logoUrl()} alt={username} className="w-full h-full rounded-full object-cover bg-card" decoding="async" onError={(e) => { (e.target as HTMLImageElement).src = logoUrl(); }} />
                        </div>
                        <div>
                            <h2 className="text-2xl font-bold text-text">{username}</h2>
                            <p className="text-muted text-sm">{loading ? 'Loading stats...' : `${data?.totalPlays || 0} total plays (${days === 'all' ? 'All Time' : `Last ${days} Days`})`}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-muted hover:text-white transition-colors bg-white/5 p-2 rounded-full"><X className="w-6 h-6" /></button>
                </div>

                <div className="flex border-b border-border bg-black/40 px-6 gap-6">
                    {['overview', 'history', 'graphs'].map(tab => (
                        <button key={tab} onClick={() => setActiveTab(tab as any)} className={`py-3 px-2 font-bold text-sm uppercase tracking-wider transition-colors border-b-2 ${activeTab === tab ? 'border-plex text-text' : 'border-transparent text-muted hover:text-white'}`}>
                            {tab}
                        </button>
                    ))}
                </div>

                <div className="p-6 overflow-y-auto flex-1 min-h-0 flex flex-col gap-8 custom-scrollbar">
                    {loading ? (
                        <div className="flex justify-center items-center h-40"><Loader isLoading={true} /></div>
                    ) : (error || !data) ? (
                        <div className="flex flex-col items-center justify-center h-40 text-center gap-2">
                            <AlertCircle className="w-8 h-8 text-red-500" />
                            <p className="text-muted text-sm">Failed to load analytics for this user.</p>
                        </div>
                    ) : activeTab === 'overview' ? (
                        <UserAnalyticsOverviewTab data={data} />
                    ) : activeTab === 'history' ? (
                        <UserAnalyticsHistoryTab
                            historySearch={historySearch}
                            handleSearch={handleSearch}
                            historyLoading={historyLoading}
                            historyData={historyData}
                            historyTotal={historyTotal}
                            historyPage={historyPage}
                            setHistoryPage={setHistoryPage}
                        />
                    ) : activeTab === 'graphs' ? (
                        <UserAnalyticsGraphsTab data={data} />
                    ) : null}
                </div>
            </div>
        </div>
    );
};
