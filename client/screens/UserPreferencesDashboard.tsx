import React from 'react';
import {
    CalendarSection,
    EmailNotificationsSection,
    HomeDefaultsSection,
    LeaderboardSection,
    LocaleSection,
    MotionSection,
    PosterDetailsSection,
    ProfileSection,
    RequestBrowsingSection,
    ThemeSection,
    TimeFormatSection,
} from './preferences/PreferenceSections';
import { useUserPreferences } from './preferences/useUserPreferences';

export const UserPreferencesDashboard: React.FC<{
    account?: any;
    activeTheme: string;
    setActiveTheme: (theme: string) => void;
    refreshSession: () => Promise<void> | void;
    readOnly?: boolean;
}> = ({ account, activeTheme, setActiveTheme, refreshSession, readOnly = false }) => {
    const prefs = useUserPreferences(account, refreshSession, readOnly);
    const sectionProps = { account, readOnly, prefs };

    return (
        <div className="w-full max-w-3xl">
            <header className="mb-6 pb-4 border-b border-border">
                <h1 className="text-2xl md:text-3xl font-bold text-text">Preferences</h1>
                <p className="text-sm text-muted mt-1">Personal choices for this portal. Email notices are opt-in and off by default.</p>
            </header>

            <div className="divide-y divide-border rounded-lg border border-border bg-card overflow-hidden">
                <ProfileSection {...sectionProps} />
                <ThemeSection activeTheme={activeTheme} setActiveTheme={setActiveTheme} />
                <TimeFormatSection prefs={prefs} />
                <LocaleSection {...sectionProps} />
                <PosterDetailsSection prefs={prefs} />
                <MotionSection prefs={prefs} />
                <HomeDefaultsSection {...sectionProps} />
                <RequestBrowsingSection prefs={prefs} />
                <CalendarSection prefs={prefs} />
                <EmailNotificationsSection {...sectionProps} />
                <LeaderboardSection {...sectionProps} />
            </div>
            {prefs.message && <p className="mt-3 text-sm text-muted" role="status">{prefs.message}</p>}
        </div>
    );
};
