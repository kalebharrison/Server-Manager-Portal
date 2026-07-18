import React, { useEffect, useState } from 'react';
import {
    CalendarDays,
    Clock3,
    EyeOff,
    Film,
    Gauge,
    Globe2,
    Home,
    Image,
    Mail,
    Palette,
    UserRound,
} from 'lucide-react';

import { apiFetch } from '../shared/api';
import { CustomSelect } from '../shared/ui';
import { loadLocalPortalPreferences, saveLocalPortalPreferences, type LocalPortalPreferences } from '../shared/userPreferences';
import {
    ANALYTICS_DAYS_OPTIONS,
    LANDING_OPTIONS,
    LOCALE_OPTIONS,
    resolveHomeAnalyticsDays,
    resolveHomeLanding,
    resolveHomeShowWeekCalendar,
    resolveHomeShowWrapUp,
    resolveLocale,
    sanitizeContactEmail,
    sanitizeDisplayName,
    wantsNewsletter,
} from '../shared/userProfile';

const themeOptions = [
    { label: 'Plex Dark', value: 'plex' },
    { label: 'Sleek Slate', value: 'slate' },
    { label: 'Nordic Frost', value: 'nordic' },
    { label: 'Jellyfin Purple', value: 'jellyfin' },
    { label: 'Emerald Green', value: 'emerald' },
    { label: 'Neon Midnight', value: 'midnight' },
];

const ToggleRow: React.FC<{
    checked: boolean;
    disabled?: boolean;
    label: string;
    onToggle: () => void;
}> = ({ checked, disabled, label, onToggle }) => (
    <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={onToggle}
        className={`relative inline-flex h-7 w-12 shrink-0 rounded-full border-2 transition-colors disabled:opacity-50 ${checked ? 'bg-plex border-plex' : 'bg-background border-border'}`}
    >
        <span className={`mt-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : 'translate-x-0.5'}`} />
    </button>
);

export const UserPreferencesDashboard: React.FC<{
    account?: any;
    activeTheme: string;
    setActiveTheme: (theme: string) => void;
    refreshSession: () => Promise<void> | void;
    readOnly?: boolean;
}> = ({ account, activeTheme, setActiveTheme, refreshSession, readOnly = false }) => {
    const [newsletterEnabled, setNewsletterEnabled] = useState(wantsNewsletter(account));
    const [displayName, setDisplayName] = useState(sanitizeDisplayName(account?.displayName));
    const [contactEmail, setContactEmail] = useState(String(account?.contactEmail || ''));
    const [notifyAccessExpiry, setNotifyAccessExpiry] = useState(account?.notifyAccessExpiry === true);
    const [notifyRequestUpdates, setNotifyRequestUpdates] = useState(account?.notifyRequestUpdates === true);
    const [notifyIssueReplies, setNotifyIssueReplies] = useState(account?.notifyIssueReplies === true);
    const [notifyWatchlistAvailable, setNotifyWatchlistAvailable] = useState(account?.notifyWatchlistAvailable === true);
    const [hideFromLeaderboards, setHideFromLeaderboards] = useState(account?.hideFromLeaderboards === true);
    const [locale, setLocale] = useState(resolveLocale(account));
    const [homeLanding, setHomeLanding] = useState(resolveHomeLanding(account));
    const [homeAnalyticsDays, setHomeAnalyticsDays] = useState(String(resolveHomeAnalyticsDays(account)));
    const [homeShowWrapUp, setHomeShowWrapUp] = useState(resolveHomeShowWrapUp(account));
    const [homeShowWeekCalendar, setHomeShowWeekCalendar] = useState(resolveHomeShowWeekCalendar(account));
    const [localPreferences, setLocalPreferences] = useState(loadLocalPortalPreferences);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState('');

    useEffect(() => {
        setNewsletterEnabled(wantsNewsletter(account));
        setDisplayName(sanitizeDisplayName(account?.displayName));
        setContactEmail(String(account?.contactEmail || ''));
        setNotifyAccessExpiry(account?.notifyAccessExpiry === true);
        setNotifyRequestUpdates(account?.notifyRequestUpdates === true);
        setNotifyIssueReplies(account?.notifyIssueReplies === true);
        setNotifyWatchlistAvailable(account?.notifyWatchlistAvailable === true);
        setHideFromLeaderboards(account?.hideFromLeaderboards === true);
        setLocale(resolveLocale(account));
        setHomeLanding(resolveHomeLanding(account));
        setHomeAnalyticsDays(String(resolveHomeAnalyticsDays(account)));
        setHomeShowWrapUp(resolveHomeShowWrapUp(account));
        setHomeShowWeekCalendar(resolveHomeShowWeekCalendar(account));
    }, [account]);

    const updateLocalPreference = <K extends keyof LocalPortalPreferences>(key: K, value: LocalPortalPreferences[K]) => {
        setLocalPreferences((current) => {
            const next = { ...current, [key]: value };
            saveLocalPortalPreferences(next);
            return next;
        });
    };

    const saveAccountPrefs = async (patch: Record<string, unknown>, successMessage = 'Preference saved.') => {
        if (!account || saving || readOnly) return false;
        setSaving(true);
        setMessage('');
        try {
            await apiFetch('/api/users/preferences', {
                method: 'POST',
                body: JSON.stringify(patch),
            });
            setMessage(successMessage);
            await refreshSession();
            return true;
        } catch (error: any) {
            setMessage(error.message || 'Unable to save preference.');
            return false;
        } finally {
            setSaving(false);
        }
    };

    const accountUsername = String(account?.username || '').trim();

    return (
        <div className="w-full max-w-3xl">
            <header className="mb-6 pb-4 border-b border-border">
                <h1 className="text-2xl md:text-3xl font-bold text-text">Preferences</h1>
                <p className="text-sm text-muted mt-1">Personal choices for this portal. Email notices are opt-in and off by default.</p>
            </header>

            <div className="divide-y divide-border rounded-lg border border-border bg-card overflow-hidden">
                {account && (
                    <section className="p-5 flex flex-col gap-4">
                        <div className="flex gap-3">
                            <UserRound className="w-5 h-5 text-plex mt-0.5" />
                            <div>
                                <h2 className="font-bold text-text">Profile</h2>
                                <p className="text-sm text-muted mt-1">
                                    Display name and optional contact email for portal notices.
                                    {accountUsername ? ` Account username stays ${accountUsername}.` : ''}
                                </p>
                            </div>
                        </div>
                        <div className="flex flex-col gap-3 pl-8">
                            <label className="text-sm text-text">Display name</label>
                            <div className="flex flex-col sm:flex-row gap-3">
                                <input
                                    type="text"
                                    value={displayName}
                                    maxLength={40}
                                    disabled={readOnly || saving}
                                    onChange={(event) => setDisplayName(event.target.value)}
                                    placeholder={accountUsername || 'Display name'}
                                    className="w-full sm:flex-1 p-3 rounded-lg border border-border bg-background text-text outline-none focus:border-plex focus:ring-1 focus:ring-plex transition-all disabled:opacity-50"
                                />
                                <button
                                    type="button"
                                    disabled={readOnly || saving}
                                    onClick={() => saveAccountPrefs({ displayName: sanitizeDisplayName(displayName) }, sanitizeDisplayName(displayName) ? 'Display name saved.' : 'Display name cleared.')}
                                    className="px-5 py-3 bg-plex text-background rounded-md font-bold hover:bg-plex-hover transition-colors disabled:opacity-50"
                                >
                                    Save name
                                </button>
                            </div>
                            <label className="text-sm text-text mt-2">Contact email</label>
                            <div className="flex flex-col sm:flex-row gap-3">
                                <input
                                    type="email"
                                    value={contactEmail}
                                    disabled={readOnly || saving}
                                    onChange={(event) => setContactEmail(event.target.value)}
                                    placeholder={account?.email || 'you@example.com'}
                                    className="w-full sm:flex-1 p-3 rounded-lg border border-border bg-background text-text outline-none focus:border-plex focus:ring-1 focus:ring-plex transition-all disabled:opacity-50"
                                />
                                <button
                                    type="button"
                                    disabled={readOnly || saving}
                                    onClick={() => {
                                        const next = sanitizeContactEmail(contactEmail);
                                        if (next === null) {
                                            setMessage('Enter a valid contact email, or leave it blank.');
                                            return;
                                        }
                                        void saveAccountPrefs({ contactEmail: next }, next ? 'Contact email saved.' : 'Contact email cleared.');
                                    }}
                                    className="px-5 py-3 bg-plex text-background rounded-md font-bold hover:bg-plex-hover transition-colors disabled:opacity-50"
                                >
                                    Save email
                                </button>
                            </div>
                            <p className="text-xs text-muted">Leave blank to use your linked account email{account?.email ? ` (${account.email})` : ''}.</p>
                        </div>
                    </section>
                )}

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

                {account && (
                    <section className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex gap-3">
                            <Globe2 className="w-5 h-5 text-plex mt-0.5" />
                            <div><h2 className="font-bold text-text">Language & region</h2><p className="text-sm text-muted mt-1">Used for dates and times in the portal and emails.</p></div>
                        </div>
                        <CustomSelect
                            value={locale}
                            onChange={(value) => {
                                if (readOnly || saving) return;
                                setLocale(value);
                                void saveAccountPrefs({ locale: value }, 'Locale saved.');
                            }}
                            options={LOCALE_OPTIONS.map((option) => ({ label: option.label, value: option.value }))}
                            compact
                            className="w-full sm:w-52"
                        />
                    </section>
                )}

                <section className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex gap-3"><Image className="w-5 h-5 text-plex mt-0.5" /><div><h2 className="font-bold text-text">Poster details</h2><p className="text-sm text-muted mt-1">Show or hide quality, codec, HDR, and audio badges.</p></div></div>
                    <CustomSelect value={localPreferences.posterBadges} onChange={(value) => updateLocalPreference('posterBadges', value as LocalPortalPreferences['posterBadges'])} options={[{ label: 'Server default', value: 'server' }, { label: 'Show badges', value: 'show' }, { label: 'Hide badges', value: 'hide' }]} compact className="w-full sm:w-52" />
                </section>

                <section className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex gap-3"><Gauge className="w-5 h-5 text-plex mt-0.5" /><div><h2 className="font-bold text-text">Motion</h2><p className="text-sm text-muted mt-1">Reduce reveal, loading, and shimmer animation.</p></div></div>
                    <CustomSelect value={localPreferences.motion} onChange={(value) => updateLocalPreference('motion', value as LocalPortalPreferences['motion'])} options={[{ label: 'Server default', value: 'server' }, { label: 'Full motion', value: 'full' }, { label: 'Reduced motion', value: 'reduced' }]} compact className="w-full sm:w-52" />
                </section>

                {account && (
                    <section className="p-5 flex flex-col gap-4">
                        <div className="flex gap-3">
                            <Home className="w-5 h-5 text-plex mt-0.5" />
                            <div><h2 className="font-bold text-text">Home defaults</h2><p className="text-sm text-muted mt-1">Landing page and home cards for your account.</p></div>
                        </div>
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pl-8">
                            <span className="text-sm text-text">After sign-in, open</span>
                            <CustomSelect
                                value={homeLanding}
                                onChange={(value) => {
                                    if (readOnly || saving) return;
                                    setHomeLanding(value as typeof homeLanding);
                                    void saveAccountPrefs({ homeLanding: value }, 'Home landing saved.');
                                }}
                                options={LANDING_OPTIONS.map((option) => ({ label: option.label, value: option.value }))}
                                compact
                                className="w-full sm:w-52"
                            />
                        </div>
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pl-8">
                            <span className="text-sm text-text">Wrap-up analytics range</span>
                            <CustomSelect
                                value={homeAnalyticsDays}
                                onChange={(value) => {
                                    if (readOnly || saving) return;
                                    setHomeAnalyticsDays(value);
                                    void saveAccountPrefs({ homeAnalyticsDays: value === 'all' ? 'all' : Number(value) }, 'Analytics range saved.');
                                }}
                                options={ANALYTICS_DAYS_OPTIONS.map((option) => ({ label: option.label, value: option.value }))}
                                compact
                                className="w-full sm:w-52"
                            />
                        </div>
                        <div className="flex items-center justify-between gap-4 pl-8">
                            <span className="text-sm text-text">Show Wrap-Up on home</span>
                            <ToggleRow
                                checked={homeShowWrapUp}
                                disabled={readOnly || saving}
                                label="Show Wrap-Up"
                                onToggle={() => {
                                    const next = !homeShowWrapUp;
                                    setHomeShowWrapUp(next);
                                    void saveAccountPrefs({ homeShowWrapUp: next });
                                }}
                            />
                        </div>
                        <div className="flex items-center justify-between gap-4 pl-8">
                            <span className="text-sm text-text">Show week calendar on home</span>
                            <ToggleRow
                                checked={homeShowWeekCalendar}
                                disabled={readOnly || saving}
                                label="Show week calendar"
                                onToggle={() => {
                                    const next = !homeShowWeekCalendar;
                                    setHomeShowWeekCalendar(next);
                                    void saveAccountPrefs({ homeShowWeekCalendar: next });
                                }}
                            />
                        </div>
                    </section>
                )}

                <section className="p-5 flex flex-col gap-4">
                    <div className="flex gap-3"><Film className="w-5 h-5 text-plex mt-0.5" /><div><h2 className="font-bold text-text">Request browsing</h2><p className="text-sm text-muted mt-1">Defaults used when opening the Request tab.</p></div></div>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pl-8">
                        <span className="text-sm text-text">Content type</span>
                        <CustomSelect value={localPreferences.requestMediaType} onChange={(value) => updateLocalPreference('requestMediaType', value as LocalPortalPreferences['requestMediaType'])} options={[{ label: 'Movies & TV', value: 'all' }, { label: 'Movies', value: 'movie' }, { label: 'TV', value: 'tv' }]} compact className="w-full sm:w-52" />
                    </div>
                    <div className="flex items-center justify-between gap-4 pl-8">
                        <span className="text-sm text-text">Include available and requested titles</span>
                        <ToggleRow checked={localPreferences.requestIncludeExisting} label="Include existing" onToggle={() => updateLocalPreference('requestIncludeExisting', !localPreferences.requestIncludeExisting)} />
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
                    <>
                        <section className="p-5 flex flex-col gap-4">
                            <div className="flex gap-3">
                                <Mail className="w-5 h-5 text-plex mt-0.5" />
                                <div><h2 className="font-bold text-text">Email notifications</h2><p className="text-sm text-muted mt-1">All off until you opt in.</p></div>
                            </div>
                            <div className="flex items-center justify-between gap-4 pl-8">
                                <div>
                                    <p className="text-sm text-text font-medium">Weekly newsletter</p>
                                    <p className="text-xs text-muted mt-1">Library highlights by email</p>
                                </div>
                                <ToggleRow
                                    checked={newsletterEnabled}
                                    disabled={saving || readOnly}
                                    label="Weekly newsletter"
                                    onToggle={() => {
                                        const next = !newsletterEnabled;
                                        setNewsletterEnabled(next);
                                        void saveAccountPrefs({ newsletterOptIn: next }, next ? 'Subscribed to the weekly newsletter.' : 'Unsubscribed from the weekly newsletter.');
                                    }}
                                />
                            </div>
                            <div className="flex items-center justify-between gap-4 pl-8">
                                <div>
                                    <p className="text-sm text-text font-medium">Access expiry notices</p>
                                    <p className="text-xs text-muted mt-1">Warnings when shared access is ending</p>
                                </div>
                                <ToggleRow
                                    checked={notifyAccessExpiry}
                                    disabled={saving || readOnly}
                                    label="Access expiry notices"
                                    onToggle={() => {
                                        const next = !notifyAccessExpiry;
                                        setNotifyAccessExpiry(next);
                                        void saveAccountPrefs({ notifyAccessExpiry: next });
                                    }}
                                />
                            </div>
                            <div className="flex items-center justify-between gap-4 pl-8">
                                <div>
                                    <p className="text-sm text-text font-medium">Request updates</p>
                                    <p className="text-xs text-muted mt-1">Approved or declined request status</p>
                                </div>
                                <ToggleRow
                                    checked={notifyRequestUpdates}
                                    disabled={saving || readOnly}
                                    label="Request updates"
                                    onToggle={() => {
                                        const next = !notifyRequestUpdates;
                                        setNotifyRequestUpdates(next);
                                        void saveAccountPrefs({ notifyRequestUpdates: next });
                                    }}
                                />
                            </div>
                            <div className="flex items-center justify-between gap-4 pl-8">
                                <div>
                                    <p className="text-sm text-text font-medium">Issue replies</p>
                                    <p className="text-xs text-muted mt-1">When an admin replies to your issue</p>
                                </div>
                                <ToggleRow
                                    checked={notifyIssueReplies}
                                    disabled={saving || readOnly}
                                    label="Issue replies"
                                    onToggle={() => {
                                        const next = !notifyIssueReplies;
                                        setNotifyIssueReplies(next);
                                        void saveAccountPrefs({ notifyIssueReplies: next });
                                    }}
                                />
                            </div>
                            <div className="flex items-center justify-between gap-4 pl-8">
                                <div>
                                    <p className="text-sm text-text font-medium">Request available</p>
                                    <p className="text-xs text-muted mt-1">When one of your requests becomes available to watch</p>
                                </div>
                                <ToggleRow
                                    checked={notifyWatchlistAvailable}
                                    disabled={saving || readOnly}
                                    label="Request available"
                                    onToggle={() => {
                                        const next = !notifyWatchlistAvailable;
                                        setNotifyWatchlistAvailable(next);
                                        void saveAccountPrefs({ notifyWatchlistAvailable: next });
                                    }}
                                />
                            </div>
                        </section>

                        <section className="p-5 flex items-center justify-between gap-4">
                            <div className="flex gap-3">
                                <EyeOff className="w-5 h-5 text-plex mt-0.5" />
                                <div>
                                    <h2 className="font-bold text-text">Hide from leaderboards</h2>
                                    <p className="text-sm text-muted mt-1">Stay off member-facing watch leaderboards and neighbourhood ranks.</p>
                                </div>
                            </div>
                            <ToggleRow
                                checked={hideFromLeaderboards}
                                disabled={saving || readOnly}
                                label="Hide from leaderboards"
                                onToggle={() => {
                                    const next = !hideFromLeaderboards;
                                    setHideFromLeaderboards(next);
                                    void saveAccountPrefs({ hideFromLeaderboards: next });
                                }}
                            />
                        </section>
                    </>
                )}
            </div>
            {message && <p className="mt-3 text-sm text-muted" role="status">{message}</p>}
        </div>
    );
};
