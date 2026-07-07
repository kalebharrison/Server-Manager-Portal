import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle, RefreshCw } from 'lucide-react';

import { apiFetch } from '../shared/api';

export const RebuildLibraryCacheButton: React.FC = () => {
    const [status, setStatus] = useState<'idle' | 'starting' | 'building' | 'done' | 'error'>('idle');
    const [lastBuilt, setLastBuilt] = useState<number | null>(null);
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => {
        apiFetch('/api/plex/stats/status').then((s: any) => {
            if (s.lastGeneratedAt) setLastBuilt(s.lastGeneratedAt);
            if (s.isBuilding) startPolling();
        }).catch(() => { });
        return () => { if (pollRef.current) clearInterval(pollRef.current); };
    }, []);

    const startPolling = () => {
        setStatus('building');
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = setInterval(async () => {
            try {
                const s: any = await apiFetch('/api/plex/stats/status');
                if (s.lastGeneratedAt) setLastBuilt(s.lastGeneratedAt);
                if (!s.isBuilding) {
                    if (pollRef.current) clearInterval(pollRef.current);
                    setStatus('done');
                    setTimeout(() => setStatus('idle'), 4000);
                }
            } catch {
                if (pollRef.current) clearInterval(pollRef.current);
                setStatus('error');
            }
        }, 3000);
    };

    const handleRebuild = async () => {
        setStatus('starting');
        try {
            await apiFetch('/api/plex/stats/rebuild', { method: 'POST' });
            startPolling();
        } catch {
            setStatus('error');
            setTimeout(() => setStatus('idle'), 3000);
        }
    };

    const isRunning = status === 'building' || status === 'starting';
    return (
        <div className="flex flex-col gap-1.5">
            <button
                onClick={handleRebuild}
                disabled={isRunning}
                className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs transition-all border
                    ${status === 'done' ? 'bg-green-500/10 border-green-500/30 text-green-400' :
                        status === 'error' ? 'bg-red-500/10 border-red-500/30 text-red-400' :
                            isRunning ? 'bg-white/5 border-white/10 text-muted cursor-not-allowed' :
                                'bg-white/5 border-white/10 text-text hover:bg-white/10'}`}
            >
                {isRunning ? (
                    <><div className="w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin" /> Building Cache...</>
                ) : status === 'done' ? (
                    <><CheckCircle size={14} /> Cache Updated!</>
                ) : status === 'error' ? (
                    <><AlertCircle size={14} /> Build Failed</>
                ) : (
                    <><RefreshCw size={14} /> Rebuild Library Cache</>
                )}
            </button>
            {lastBuilt && (
                <p className="text-[10px] text-muted text-center">
                    Last built: {new Date(lastBuilt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </p>
            )}
        </div>
    );
};
