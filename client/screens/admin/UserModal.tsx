import React, { useEffect, useState } from 'react';

import { addMonths, addYears, formatDate } from '../../shared/format';
import type { User } from '../../shared/types';

export const UserModal: React.FC<{ isOpen: boolean; onClose: () => void; onSave: (user: User) => void; user: User | null }> = ({ isOpen, onClose, onSave, user }) => {
    const [username, setUsername] = useState('');
    const [joiningDate, setJoiningDate] = useState(formatDate(new Date().toISOString()));
    const [expiryDate, setExpiryDate] = useState<string | null>(formatDate(addMonths(new Date(), 1).toISOString()));
    const [exemptFromCleanup, setExemptFromCleanup] = useState(false);
    const [newsletterOptIn, setNewsletterOptIn] = useState(false);

    useEffect(() => {
        if (user) {
            setUsername(user.username);
            setJoiningDate(formatDate(user.joiningDate));
            setExpiryDate(user.expiryDate ? formatDate(user.expiryDate) : null);
            setExemptFromCleanup(!!user.exemptFromCleanup);
            setNewsletterOptIn(user.newsletterOptIn === true);
        } else {
            setUsername('');
            setJoiningDate(formatDate(new Date().toISOString()));
            setExpiryDate(formatDate(addMonths(new Date(), 1).toISOString()));
            setExemptFromCleanup(false);
            setNewsletterOptIn(false);
        }
    }, [user, isOpen]);

    if (!isOpen) return null;

    const handleSave = () => {
        if (!user) return;
        onSave({ ...user, expiryDate, exemptFromCleanup, newsletterOptIn });
    };

    const handleQuickAction = (action: 'addMonth' | 'addYear' | 'unlimited') => {
        const baseDate = expiryDate ? new Date(expiryDate) : new Date();
        if (expiryDate) baseDate.setMinutes(baseDate.getMinutes() + baseDate.getTimezoneOffset());

        switch (action) {
            case 'addMonth': setExpiryDate(formatDate(addMonths(baseDate, 1).toISOString())); break;
            case 'addYear': setExpiryDate(formatDate(addYears(baseDate, 1).toISOString())); break;
            case 'unlimited': setExpiryDate(null); break;
        }
    };

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex justify-center items-center z-[1000]" onClick={onClose}>
            <div className="bg-card p-4 md:p-8 rounded-2xl w-[90%] max-w-lg shadow-2xl border border-border" onClick={(e) => e.stopPropagation()}>
                <h2 className="text-2xl font-bold text-text">Edit User</h2>
                <div className="mb-4">
                    <label>Plex Username</label>
                    <input className="w-full p-3 rounded-lg border border-border bg-background text-text outline-none focus:border-plex focus:ring-1 focus:ring-plex transition-all" type="text" value={username} disabled />
                </div>
                <div className="mb-4">
                    <label>Joining Date</label>
                    <input className="w-full p-3 rounded-lg border border-border bg-background text-text outline-none focus:border-plex focus:ring-1 focus:ring-plex transition-all" type="date" value={joiningDate} disabled />
                </div>
                <div className="mb-4">
                    <label htmlFor="expiryDate">Expiry Date</label>
                    <input className="w-full p-3 rounded-lg border border-border bg-background text-text outline-none focus:border-plex focus:ring-1 focus:ring-plex transition-all" id="expiryDate" type="date" value={expiryDate ?? ''} onChange={(e) => setExpiryDate(e.target.value)} />
                    <div className="mt-3 grid grid-cols-3 gap-2">
                        <button className="w-full h-10 px-3 bg-border text-text rounded-md font-medium hover:bg-opacity-80 transition-colors flex items-center justify-center text-sm whitespace-nowrap" onClick={() => handleQuickAction('addMonth')}>+1M</button>
                        <button className="w-full h-10 px-3 bg-border text-text rounded-md font-medium hover:bg-opacity-80 transition-colors flex items-center justify-center text-sm whitespace-nowrap" onClick={() => handleQuickAction('addYear')}>+1Y</button>
                        <button className="w-full h-10 px-3 bg-border text-text rounded-md font-medium hover:bg-opacity-80 transition-colors flex items-center justify-center text-sm whitespace-nowrap" onClick={() => handleQuickAction('unlimited')}>Unlimited</button>
                    </div>
                </div>
                <div className="mb-4 flex items-center justify-between bg-black/10 p-4 rounded-lg border border-border">
                    <div>
                        <label className="font-bold block mb-1">Exempt from Cleanup</label>
                        <span className="text-xs text-muted block">Prevent automated inactive user removal</span>
                    </div>
                    <button
                        onClick={() => setExemptFromCleanup(!exemptFromCleanup)}
                        className={`relative inline-flex items-center h-6 rounded-full w-11 transition-colors ${exemptFromCleanup ? 'bg-plex' : 'bg-border'}`}
                    >
                        <span className={`inline-block w-4 h-4 transform bg-white rounded-full transition-transform ${exemptFromCleanup ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                </div>
                <h3 className="text-xs uppercase tracking-wider font-bold text-muted mt-6 mb-2">User Preferences</h3>
                <div className="mb-4 flex items-center justify-between bg-black/10 p-4 rounded-lg border border-border">
                    <div>
                        <label className="font-bold block mb-1">Newsletter subscribed</label>
                        <span className="text-xs text-muted block">Opt-in weekly library email (off by default)</span>
                    </div>
                    <button
                        onClick={() => setNewsletterOptIn(!newsletterOptIn)}
                        className={`relative inline-flex items-center h-6 rounded-full w-11 transition-colors ${newsletterOptIn ? 'bg-plex' : 'bg-border'}`}
                    >
                        <span className={`inline-block w-4 h-4 transform bg-white rounded-full transition-transform ${newsletterOptIn ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                </div>
                <div className="flex justify-end gap-4 mt-8 pt-4 border-t border-border">
                    <button className="px-6 py-3 bg-plex text-background rounded-md font-bold hover:bg-plex-hover transition-colors flex items-center justify-center gap-2" onClick={handleSave}>Save</button>
                </div>
            </div>
        </div>
    );
};
