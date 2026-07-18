import React from 'react';
import { Clock3, Gauge, Globe2, Image, Palette } from 'lucide-react';
import { CustomSelect } from '../../shared/ui';
import type { LocalPortalPreferences } from '../../shared/userPreferences';
import { LOCALE_OPTIONS } from '../../shared/userProfile';
import { themeOptions } from './shared';
import type { SectionProps } from './types';
import type { UserPreferencesState } from './useUserPreferences';

type ThemeSectionProps = {
    activeTheme: string;
    setActiveTheme: (theme: string) => void;
};

export const ThemeSection: React.FC<ThemeSectionProps> = ({ activeTheme, setActiveTheme }) => (
    <section className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex gap-3">
            <Palette className="w-5 h-5 text-plex mt-0.5" />
            <div><h2 className="font-bold text-text">Theme</h2><p className="text-sm text-muted mt-1">Saved on this browser and device.</p></div>
        </div>
        <CustomSelect value={activeTheme} onChange={setActiveTheme} options={themeOptions} compact className="w-full sm:w-52" />
    </section>
);

export const TimeFormatSection: React.FC<{ prefs: UserPreferencesState }> = ({ prefs }) => {
    const { localPreferences, updateLocalPreference } = prefs;
    return (
        <section className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex gap-3"><Clock3 className="w-5 h-5 text-plex mt-0.5" /><div><h2 className="font-bold text-text">Time format</h2><p className="text-sm text-muted mt-1">Override the server default on this device.</p></div></div>
            <CustomSelect value={localPreferences.clock} onChange={(value) => updateLocalPreference('clock', value as LocalPortalPreferences['clock'])} options={[{ label: 'Server default', value: 'server' }, { label: '12-hour', value: '12' }, { label: '24-hour', value: '24' }]} compact className="w-full sm:w-52" />
        </section>
    );
};

export const LocaleSection: React.FC<SectionProps> = ({ account, readOnly, prefs }) => {
    const { locale, setLocale, saving, saveAccountPrefs } = prefs;
    if (!account) return null;

    return (
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
    );
};

export const PosterDetailsSection: React.FC<{ prefs: UserPreferencesState }> = ({ prefs }) => {
    const { localPreferences, updateLocalPreference } = prefs;
    return (
        <section className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex gap-3"><Image className="w-5 h-5 text-plex mt-0.5" /><div><h2 className="font-bold text-text">Poster details</h2><p className="text-sm text-muted mt-1">Show or hide quality, codec, HDR, and audio badges.</p></div></div>
            <CustomSelect value={localPreferences.posterBadges} onChange={(value) => updateLocalPreference('posterBadges', value as LocalPortalPreferences['posterBadges'])} options={[{ label: 'Server default', value: 'server' }, { label: 'Show badges', value: 'show' }, { label: 'Hide badges', value: 'hide' }]} compact className="w-full sm:w-52" />
        </section>
    );
};

export const MotionSection: React.FC<{ prefs: UserPreferencesState }> = ({ prefs }) => {
    const { localPreferences, updateLocalPreference } = prefs;
    return (
        <section className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex gap-3"><Gauge className="w-5 h-5 text-plex mt-0.5" /><div><h2 className="font-bold text-text">Motion</h2><p className="text-sm text-muted mt-1">Reduce reveal, loading, and shimmer animation.</p></div></div>
            <CustomSelect value={localPreferences.motion} onChange={(value) => updateLocalPreference('motion', value as LocalPortalPreferences['motion'])} options={[{ label: 'Server default', value: 'server' }, { label: 'Full motion', value: 'full' }, { label: 'Reduced motion', value: 'reduced' }]} compact className="w-full sm:w-52" />
        </section>
    );
};
