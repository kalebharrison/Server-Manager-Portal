import React, { useEffect, useState } from 'react';
import { Bell, Palette } from 'lucide-react';

import { apiFetch } from '../shared/api';
import { CustomSelect } from '../shared/ui';

const themeOptions = [
    { label: 'Plex Dark', value: 'plex' },
    { label: 'Sleek Slate', value: 'slate' },
    { label: 'Nordic Frost', value: 'nordic' },
    { label: 'Jellyfin Purple', value: 'jellyfin' },
    { label: 'Emerald Green', value: 'emerald' },
    { label: 'Neon Midnight', value: 'midnight' },
];

export const UserPreferencesDashboard: React.FC<{
    account?: any;
    activeTheme: string;
    setActiveTheme: (theme: string) => void;
    refreshSession: () => Promise<void> | void;
    readOnly?: boolean;
}> = ({ account, activeTheme, setActiveTheme, refreshSession, readOnly = false }) => {
    const [newsletterEnabled, setNewsletterEnabled] = useState(!account?.optOutNewsletter);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState('');

    useEffect(() => setNewsletterEnabled(!account?.optOutNewsletter), [account?.optOutNewsletter]);

    const toggleNewsletter = async () => {
        if (!account || saving || readOnly) return;
        const nextEnabled = !newsletterEnabled;
        setSaving(true);
        setMessage('');
        try {
            await apiFetch('/api/users/preferences', {
                method: 'POST',
                body: JSON.stringify({ optOutNewsletter: !nextEnabled }),
            });
            setNewsletterEnabled(nextEnabled);
            setMessage('Preference saved.');
            await refreshSession();
        } catch (error: any) {
            setMessage(error.message || 'Unable to save preference.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="w-full max-w-3xl">
            <header className="mb-6 pb-4 border-b border-border">
                <h1 className="text-2xl md:text-3xl font-bold text-text">Preferences</h1>
                <p className="text-sm text-muted mt-1">Personal choices for this portal.</p>
            </header>

            <div className="divide-y divide-border rounded-lg border border-border bg-card overflow-hidden">
                <section className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex gap-3">
                        <Palette className="w-5 h-5 text-plex mt-0.5" />
                        <div><h2 className="font-bold text-text">Theme</h2><p className="text-sm text-muted mt-1">Saved on this browser and device.</p></div>
                    </div>
                    <CustomSelect value={activeTheme} onChange={setActiveTheme} options={themeOptions} compact className="w-full sm:w-52" />
                </section>

                {account && (
                    <section className="p-5 flex items-center justify-between gap-4">
                        <div className="flex gap-3">
                            <Bell className="w-5 h-5 text-plex mt-0.5" />
                            <div><h2 className="font-bold text-text">Weekly newsletter</h2><p className="text-sm text-muted mt-1">Receive library updates by email.</p></div>
                        </div>
                        <button type="button" role="switch" aria-checked={newsletterEnabled} aria-label="Weekly newsletter" disabled={saving || readOnly} onClick={toggleNewsletter} className={`relative inline-flex h-7 w-12 shrink-0 rounded-full border-2 transition-colors disabled:opacity-50 ${newsletterEnabled ? 'bg-plex border-plex' : 'bg-background border-border'}`}>
                            <span className={`mt-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${newsletterEnabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
                        </button>
                    </section>
                )}
            </div>
            {message && <p className="mt-3 text-sm text-muted" role="status">{message}</p>}
        </div>
    );
};
