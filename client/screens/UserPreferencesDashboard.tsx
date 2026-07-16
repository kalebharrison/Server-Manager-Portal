import React, { useEffect, useState } from 'react';
import { Bell, CalendarDays, Clock3, Film, Gauge, Image, Palette } from 'lucide-react';

import { apiFetch } from '../shared/api';
import { CustomSelect } from '../shared/ui';
import { loadLocalPortalPreferences, saveLocalPortalPreferences, type LocalPortalPreferences } from '../shared/userPreferences';

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
    const [localPreferences, setLocalPreferences] = useState(loadLocalPortalPreferences);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState('');

    useEffect(() => setNewsletterEnabled(!account?.optOutNewsletter), [account?.optOutNewsletter]);

    const updateLocalPreference = <K extends keyof LocalPortalPreferences>(key: K, value: LocalPortalPreferences[K]) => {
        setLocalPreferences((current) => {
            const next = { ...current, [key]: value };
            saveLocalPortalPreferences(next);
            return next;
        });
    };

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

                <section className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex gap-3"><Clock3 className="w-5 h-5 text-plex mt-0.5" /><div><h2 className="font-bold text-text">Time format</h2><p className="text-sm text-muted mt-1">Override the server default on this device.</p></div></div>
                    <CustomSelect value={localPreferences.clock} onChange={(value) => updateLocalPreference('clock', value as LocalPortalPreferences['clock'])} options={[{ label: 'Server default', value: 'server' }, { label: '12-hour', value: '12' }, { label: '24-hour', value: '24' }]} compact className="w-full sm:w-52" />
                </section>

                <section className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex gap-3"><Image className="w-5 h-5 text-plex mt-0.5" /><div><h2 className="font-bold text-text">Poster details</h2><p className="text-sm text-muted mt-1">Show or hide quality, codec, HDR, and audio badges.</p></div></div>
                    <CustomSelect value={localPreferences.posterBadges} onChange={(value) => updateLocalPreference('posterBadges', value as LocalPortalPreferences['posterBadges'])} options={[{ label: 'Server default', value: 'server' }, { label: 'Show badges', value: 'show' }, { label: 'Hide badges', value: 'hide' }]} compact className="w-full sm:w-52" />
                </section>

                <section className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex gap-3"><Gauge className="w-5 h-5 text-plex mt-0.5" /><div><h2 className="font-bold text-text">Motion</h2><p className="text-sm text-muted mt-1">Reduce reveal, loading, and shimmer animation.</p></div></div>
                    <CustomSelect value={localPreferences.motion} onChange={(value) => updateLocalPreference('motion', value as LocalPortalPreferences['motion'])} options={[{ label: 'Server default', value: 'server' }, { label: 'Full motion', value: 'full' }, { label: 'Reduced motion', value: 'reduced' }]} compact className="w-full sm:w-52" />
                </section>

                <section className="p-5 flex flex-col gap-4">
                    <div className="flex gap-3"><Film className="w-5 h-5 text-plex mt-0.5" /><div><h2 className="font-bold text-text">Request browsing</h2><p className="text-sm text-muted mt-1">Defaults used when opening the Request tab.</p></div></div>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pl-8">
                        <span className="text-sm text-text">Content type</span>
                        <CustomSelect value={localPreferences.requestMediaType} onChange={(value) => updateLocalPreference('requestMediaType', value as LocalPortalPreferences['requestMediaType'])} options={[{ label: 'Movies & TV', value: 'all' }, { label: 'Movies', value: 'movie' }, { label: 'TV', value: 'tv' }]} compact className="w-full sm:w-52" />
                    </div>
                    <div className="flex items-center justify-between gap-4 pl-8">
                        <span className="text-sm text-text">Include available and requested titles</span>
                        <button type="button" role="switch" aria-checked={localPreferences.requestIncludeExisting} onClick={() => updateLocalPreference('requestIncludeExisting', !localPreferences.requestIncludeExisting)} className={`relative inline-flex h-7 w-12 shrink-0 rounded-full border-2 transition-colors ${localPreferences.requestIncludeExisting ? 'bg-plex border-plex' : 'bg-background border-border'}`}>
                            <span className={`mt-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${localPreferences.requestIncludeExisting ? 'translate-x-5' : 'translate-x-0.5'}`} />
                        </button>
                    </div>
                </section>

                <section className="p-5 flex flex-col gap-4">
                    <div className="flex gap-3"><CalendarDays className="w-5 h-5 text-plex mt-0.5" /><div><h2 className="font-bold text-text">Calendar</h2><p className="text-sm text-muted mt-1">Defaults used when opening the release calendar.</p></div></div>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pl-8">
                        <span className="text-sm text-text">Content type</span>
                        <CustomSelect value={localPreferences.calendarMediaType} onChange={(value) => updateLocalPreference('calendarMediaType', value as LocalPortalPreferences['calendarMediaType'])} options={[{ label: 'Movies & TV', value: 'all' }, { label: 'Movies', value: 'movie' }, { label: 'TV', value: 'tv' }]} compact className="w-full sm:w-52" />
                    </div>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pl-8">
                        <span className="text-sm text-text">Default view</span>
                        <CustomSelect value={localPreferences.calendarView} onChange={(value) => updateLocalPreference('calendarView', value as LocalPortalPreferences['calendarView'])} options={[{ label: 'Upcoming list', value: 'list' }, { label: 'Month', value: 'month' }]} compact className="w-full sm:w-52" />
                    </div>
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
