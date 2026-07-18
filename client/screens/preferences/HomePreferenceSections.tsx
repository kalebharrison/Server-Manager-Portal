import React from 'react';
import { CalendarDays, Film, Home } from 'lucide-react';
import { CustomSelect } from '../../shared/ui';
import type { LocalPortalPreferences } from '../../shared/userPreferences';
import { ANALYTICS_DAYS_OPTIONS, LANDING_OPTIONS } from '../../shared/userProfile';
import { ToggleRow } from './shared';
import type { SectionProps } from './types';
import type { UserPreferencesState } from './useUserPreferences';

export const HomeDefaultsSection: React.FC<SectionProps> = ({ account, readOnly, prefs }) => {
    const {
        homeLanding,
        setHomeLanding,
        homeAnalyticsDays,
        setHomeAnalyticsDays,
        homeShowWrapUp,
        setHomeShowWrapUp,
        homeShowWeekCalendar,
        setHomeShowWeekCalendar,
        saving,
        saveAccountPrefs,
    } = prefs;

    if (!account) return null;

    return (
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
    );
};

export const RequestBrowsingSection: React.FC<{ prefs: UserPreferencesState }> = ({ prefs }) => {
    const { localPreferences, updateLocalPreference } = prefs;
    return (
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
    );
};

export const CalendarSection: React.FC<{ prefs: UserPreferencesState }> = ({ prefs }) => {
    const { localPreferences, updateLocalPreference } = prefs;
    return (
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
    );
};
