import React, { useEffect } from 'react';
import { X } from 'lucide-react';

import { WrapUpContent } from './wrap-up/WrapUpContent';

interface WrapUpModalProps {
    metric: string;
    analytics: any;
    days: number | string;
    onClose: () => void;
}

export const WrapUpModal: React.FC<WrapUpModalProps> = ({ metric, analytics, days, onClose }) => {
    useEffect(() => {
        const handleEsc = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [onClose]);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm transition-opacity" onClick={onClose} />
            <div className="relative bg-gradient-to-b from-card to-background border border-border/80 shadow-[0_0_50px_rgba(0,0,0,0.5)] rounded-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-plex/0 via-plex to-plex/0 opacity-50"></div>
                <button onClick={onClose} className="absolute top-4 right-4 text-muted hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 rounded-full p-2 transition-all z-20 group">
                    <X className="w-4 h-4 group-hover:rotate-90 transition-transform duration-300" />
                </button>
                <WrapUpContent metric={metric} analytics={analytics} days={days} />
            </div>
        </div>
    );
};
