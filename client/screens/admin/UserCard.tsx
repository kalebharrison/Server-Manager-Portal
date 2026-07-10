import React, { useMemo } from 'react';

import { resolvePortalAssetUrl } from '../../shared/basePath';
import { formatDate, getDaysUntilExpiry } from '../../shared/format';
import type { User, UserStatus } from '../../shared/types';

export const UserCard: React.FC<{
    user: User;
    onEdit: () => void;
    onDelete: () => void;
    onRevoke: () => void;
    isConfigured: boolean;
    isSelected: boolean;
    onSelect: (id: string) => void;
    providerLabel?: string;
}> = ({ user, onEdit, onDelete, onRevoke, isConfigured, isSelected, onSelect, providerLabel = 'Plex' }) => {
    const { status, statusText, daysRemainingText, pillClass, borderClass, glowClass } = useMemo(() => {
        const days = getDaysUntilExpiry(user.expiryDate);
        let status: UserStatus = 'active';
        let statusText = 'Active';
        let daysRemainingText = '';
        let pillClass = 'bg-green-500/10 text-green-400 border border-green-500/20';
        let borderClass = 'border-green-500/30';
        let glowClass = 'hover:border-green-500/50 hover:shadow-[0_0_15px_rgba(34,197,94,0.12)]';

        if (days === null) {
            daysRemainingText = 'Access never expires.';
        } else if (days < 0) {
            status = 'expired';
            statusText = 'Expired';
            daysRemainingText = `Expired ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} ago.`;
            pillClass = 'bg-red-500/10 text-red-400 border border-red-500/20';
            borderClass = 'border-red-500/30';
            glowClass = 'hover:border-red-500/50 hover:shadow-[0_0_15px_rgba(239,68,68,0.12)]';
        } else if (days <= 30) {
            status = 'expiring';
            statusText = 'Expiring Soon';
            daysRemainingText = days === 0 ? 'Expires today.' : `Expires in ${days} day${days === 1 ? '' : 's'}.`;
            pillClass = 'bg-orange-500/10 text-orange-400 border border-orange-500/20';
            borderClass = 'border-orange-500/30';
            glowClass = 'hover:border-orange-500/50 hover:shadow-[0_0_15px_rgba(249,115,22,0.12)]';
        } else {
            daysRemainingText = `Expires in ${days} day${days === 1 ? '' : 's'}.`;
        }

        return { status, statusText, daysRemainingText, pillClass, borderClass, glowClass };
    }, [user.expiryDate]);

    return (
        <div className={`bg-card/45 backdrop-blur-md rounded-xl p-5 shadow-lg border border-white/5 border-l-4 ${borderClass} ${glowClass} hover:-translate-y-1 hover:scale-[1.01] transition-all duration-300 flex flex-col relative cursor-pointer ${isSelected ? 'border-plex/40 shadow-[0_0_15px_rgba(229,160,13,0.12)] bg-card/75' : ''}`} onClick={() => onSelect(user.id)}>
            <div className="flex justify-between items-start mb-3">
                <div className="flex items-center gap-2.5 min-w-0">
                    <input className="w-4 h-4 flex-shrink-0 appearance-none rounded-full border border-muted checked:bg-plex checked:border-plex transition-colors cursor-pointer relative checked:after:content-[''] checked:after:block checked:after:w-1.5 checked:after:h-1.5 checked:after:bg-background checked:after:rounded-full checked:after:absolute checked:after:top-1/2 checked:after:left-1/2 checked:after:-translate-x-1/2 checked:after:-translate-y-1/2"
                        type="checkbox"
                        checked={isSelected}
                        readOnly
                        style={{ borderRadius: '50%' }}
                    />
                    {user.thumb ? (
                        <img src={resolvePortalAssetUrl(user.thumb)} alt={user.username} className="w-8 h-8 rounded-full object-cover border border-border flex-shrink-0" />
                    ) : (
                        <div className="w-8 h-8 rounded-full bg-border flex items-center justify-center text-text font-bold text-xs uppercase flex-shrink-0">
                            {user.username.substring(0, 2)}
                        </div>
                    )}
                    <div className="flex flex-col min-w-0 pr-1">
                        <h3 className="text-sm font-bold truncate leading-tight" title={user.username}>{user.username}</h3>
                        {user.email && <span className="text-[10px] text-muted truncate mt-0.5" title={user.email}>{user.email}</span>}
                    </div>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider whitespace-nowrap ${pillClass}`}>{statusText}</span>
            </div>
            <div className="flex flex-col gap-2 mt-3 flex-grow">
                <div className="flex justify-between items-center text-xs pb-1.5 border-b border-white/5 last:border-0 last:pb-0">
                    <span className="text-muted text-[10px] uppercase tracking-wider font-bold">Joined</span>
                    <span className="text-text font-medium">{formatDate(user.joiningDate)}</span>
                </div>
                <div className="flex justify-between items-start text-xs pb-1.5 border-b border-white/5 last:border-0 last:pb-0 gap-2">
                    <span className="text-muted text-[10px] uppercase tracking-wider font-bold flex-shrink-0 pt-0.5">Expires</span>
                    <span className="text-text font-medium flex flex-col items-end text-right">
                        <span className="whitespace-nowrap font-bold">{formatDate(user.expiryDate)}</span>
                        <span className="text-[9px] text-muted mt-0.5">{daysRemainingText}</span>
                    </span>
                </div>
                <div className="flex justify-between items-center text-xs pb-1.5 border-b border-white/5 last:border-0 last:pb-0">
                    <span className="text-muted text-[10px] uppercase tracking-wider font-bold">{providerLabel}</span>
                    <span className="info-value plex-status flex items-center gap-1.5">
                        <span className={`plex-status-dot ${user.plexAccessStatus || 'unknown'}`}></span>
                        <span className="text-text font-medium text-xs">{(user.plexAccessStatus || 'unknown').charAt(0).toUpperCase() + (user.plexAccessStatus || 'unknown').slice(1)}</span>
                    </span>
                </div>
                <div className="flex justify-between items-center text-xs pb-1.5 border-b border-white/5 last:border-0 last:pb-0">
                    <span className="text-muted text-[10px] uppercase tracking-wider font-bold">Last Login</span>
                    <span className="text-text font-medium">{user.lastLogin ? formatDate(user.lastLogin) : 'Never'}</span>
                </div>
            </div>
            <div className="flex gap-2 mt-auto pt-4" onClick={e => e.stopPropagation()}>
                <button className="px-3 py-1.5 bg-border text-text rounded-md text-xs font-semibold hover:bg-opacity-80 transition-colors flex items-center justify-center gap-1.5" onClick={onEdit}>Edit</button>
                <button className="px-3 py-1.5 bg-border text-text rounded-md text-xs font-semibold hover:bg-opacity-80 transition-colors flex items-center justify-center gap-1.5" onClick={onDelete}>Delete</button>
                {status === 'expired' && user.plexAccessStatus !== 'revoked' && (
                    <button className="px-3 py-1.5 bg-border text-text rounded-md text-xs font-semibold hover:bg-opacity-80 transition-colors flex items-center justify-center gap-1.5" onClick={onRevoke} disabled={!isConfigured}>Revoke</button>
                )}
            </div>
        </div>
    );
};
