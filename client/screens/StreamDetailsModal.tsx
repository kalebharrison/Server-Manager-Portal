import React, { useState } from 'react';
import { X } from 'lucide-react';

import { apiFetch } from '../shared/api';
import { portalUrl, resolvePortalAssetUrl } from '../shared/basePath';

export const StreamDetailsModal: React.FC<{ session: any, onClose: () => void, isAdmin?: boolean, onKilled?: () => void, providerLabel?: string }> = ({ session, onClose, isAdmin, onKilled, providerLabel = 'Plex' }) => {
    const [killReason, setKillReason] = useState('');
    const [isKilling, setIsKilling] = useState(false);
    const [showKillConfirm, setShowKillConfirm] = useState(false);
    const sessionPosterSrc = session.thumbUrl
        ? resolvePortalAssetUrl(session.thumbUrl)
        : portalUrl(`/api/plex/image?path=${encodeURIComponent(session.thumb)}&width=400&height=600`);
    const sessionUserThumbSrc = session.userThumb ? resolvePortalAssetUrl(session.userThumb) : 'https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y';

    const handleKill = async () => {
        setIsKilling(true);
        try {
            const res = await apiFetch('/api/streams/kill', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionId: session.sessionId, reason: killReason })
            });
            if (res.error) {
                alert(res.error);
            } else {
                onClose();
                if (onKilled) onKilled();
            }
        } catch (e: any) {
            alert('Failed to kill stream');
        } finally {
            setIsKilling(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-card w-full max-w-2xl rounded-2xl overflow-hidden shadow-2xl relative flex flex-col md:flex-row" onClick={e => e.stopPropagation()}>
                <div className="w-full md:w-1/3 relative bg-black flex-shrink-0">
                    <div className="w-full pb-[150%] md:pb-0 md:h-full relative">
                        <img src={sessionPosterSrc} alt={session.title} className="absolute inset-0 w-full h-full object-cover opacity-80" />
                        <div className="absolute inset-0 bg-gradient-to-t from-card to-transparent md:bg-gradient-to-r"></div>
                    </div>
                    {session.user && (
                        <div className="absolute top-4 left-4 flex items-center gap-2 bg-black/60 backdrop-blur-md rounded-full pr-4 p-1.5 shadow-lg border border-white/10 z-10">
                            <img src={sessionUserThumbSrc} className="w-8 h-8 rounded-full object-cover" onError={(e) => { e.currentTarget.src = 'https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y'; }} />
                            <span className="text-xs font-bold text-white truncate max-w-[120px]">{session.user}</span>
                        </div>
                    )}
                </div>

                <div className="p-6 md:p-8 flex flex-col flex-grow relative">
                    <button onClick={onClose} className="absolute top-4 right-4 text-muted hover:text-white transition-colors bg-white/5 rounded-full p-2">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>

                    <h2 className="text-2xl font-bold text-text leading-tight mb-1 pr-10">{session.grandparentTitle || session.title}</h2>
                    <p className="text-base text-muted mb-4">{session.grandparentTitle ? session.title : ''} {session.type === 'episode' && session.season !== undefined ? `| S${String(session.season).padStart(2, '0')}E${String(session.episode).padStart(2, '0')}` : ''}</p>

                    <div className="flex flex-wrap gap-2 mb-6">
                        {session.resolution && <span className="bg-white/10 text-white/90 text-[10px] font-bold px-2 py-1 rounded uppercase tracking-wide border border-white/10">{session.resolution.includes('p') || session.resolution.includes('k') ? session.resolution : `${session.resolution}p`}</span>}
                        <span className={`text-[10px] font-bold px-2 py-1 rounded uppercase tracking-wide border ${session.sessionLocation === 'lan' ? 'bg-status-active/20 text-status-active border-status-active/30' : 'bg-plex/20 text-plex border-plex/30'}`}>{session.sessionLocation === 'lan' ? 'Local' : 'Remote'}</span>
                        <span className={`text-[10px] font-bold px-2 py-1 rounded uppercase tracking-wide border ${session.isTranscoding ? 'bg-status-expiring/20 text-status-expiring border-status-expiring/30' : 'bg-status-active/20 text-status-active border-status-active/30'}`}>{session.isTranscoding ? 'Transcode' : 'Direct Play'}</span>
                    </div>

                    <div className="grid grid-cols-2 gap-x-6 gap-y-4 mb-8">
                        <div>
                            <p className="text-[10px] text-muted uppercase tracking-widest font-bold mb-1">Player</p>
                            <p className="text-sm font-medium truncate" title={session.playerTitle}>{session.playerTitle}</p>
                            <p className="text-xs text-muted/80 truncate" title={session.playerProduct}>{session.playerProduct}</p>
                        </div>
                        <div>
                            <p className="text-[10px] text-muted uppercase tracking-widest font-bold mb-1">Network</p>
                            <p className="text-sm font-medium">{session.playerAddress}</p>
                            <p className="text-xs text-muted/80">{(session.bandwidth / 1000).toFixed(1)} Mbps</p>
                        </div>

                        <div>
                            <p className="text-[10px] text-muted uppercase tracking-widest font-bold mb-1">Video</p>
                            <p className="text-sm font-medium uppercase">{session.videoCodec || 'Unknown'} {session.videoProfile ? `(${session.videoProfile})` : ''}</p>
                            {session.transcodeVideoDecision === 'transcode' && <p className="text-[10px] text-status-expiring font-bold">Transcoding</p>}
                        </div>
                        <div>
                            <p className="text-[10px] text-muted uppercase tracking-widest font-bold mb-1">Audio</p>
                            <p className="text-sm font-medium uppercase">{session.audioCodec || 'Unknown'} {session.audioChannels ? `(${session.audioChannels}ch)` : ''}</p>
                            {session.transcodeAudioDecision === 'transcode' && <p className="text-[10px] text-status-expiring font-bold">Transcoding</p>}
                        </div>
                    </div>

                    <div className="mt-auto flex flex-col gap-3 pt-4 border-t border-white/5">
                        {isAdmin && session.sessionId && (
                            showKillConfirm ? (
                                <div className="flex flex-col gap-2 bg-red-500/10 border border-red-500/20 p-3 rounded-lg">
                                    <input type="text" placeholder="Reason (Optional)" value={killReason} onChange={e => setKillReason(e.target.value)} className="w-full bg-black/30 border border-red-500/30 rounded px-3 py-2 text-sm text-white placeholder-white/40 focus:outline-none focus:border-red-500" />
                                    <div className="flex gap-2">
                                        <button onClick={handleKill} disabled={isKilling} className="flex-1 bg-red-500 hover:bg-red-600 text-white font-bold py-2 rounded transition-colors text-sm">
                                            {isKilling ? 'Killing...' : 'Confirm Kill'}
                                        </button>
                                        <button onClick={() => setShowKillConfirm(false)} className="px-4 bg-white/10 hover:bg-white/20 text-white font-bold py-2 rounded transition-colors text-sm">
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <button onClick={() => setShowKillConfirm(true)} className="w-full bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30 font-bold py-2.5 rounded-lg transition-colors text-sm flex items-center justify-center gap-2">
                                    <X className="w-4 h-4" /> Terminate Stream
                                </button>
                            )
                        )}
                        <a href={session.plexUrl} target="_blank" rel="noreferrer" className="flex-1 bg-plex text-background font-bold text-center py-3 rounded-lg hover:bg-plex-hover transition-colors shadow-lg">
                            Open in {providerLabel}
                        </a>
                    </div>
                </div>
            </div>
        </div>
    );
};
