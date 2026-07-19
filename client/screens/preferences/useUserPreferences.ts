import { useEffect, useState } from 'react';
import { apiFetch } from '../../shared/api';
import { loadLocalPortalPreferences, saveLocalPortalPreferences, type LocalPortalPreferences } from '../../shared/userPreferences';
import {
    resolveHomeAnalyticsDays,
    resolveHomeLanding,
    resolveHomeShowWeekCalendar,
    resolveHomeShowWrapUp,
    resolveLocale,
    sanitizeDisplayName,
    wantsNewsletter,
} from '../../shared/userProfile';

export const useUserPreferences = (
    account: any,
    refreshSession: () => Promise<void> | void,
    readOnly: boolean,
) => {
    const [newsletterEnabled, setNewsletterEnabled] = useState(wantsNewsletter(account));
    const [displayName, setDisplayName] = useState(sanitizeDisplayName(account?.displayName));
    const [contactEmail, setContactEmail] = useState(String(account?.contactEmail || ''));
    const [discordId, setDiscordId] = useState(String(account?.discordId || ''));
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
        setDiscordId(String(account?.discordId || ''));
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

    return {
        newsletterEnabled,
        setNewsletterEnabled,
        displayName,
        setDisplayName,
        contactEmail,
        setContactEmail,
        discordId,
        setDiscordId,
        notifyAccessExpiry,
        setNotifyAccessExpiry,
        notifyRequestUpdates,
        setNotifyRequestUpdates,
        notifyIssueReplies,
        setNotifyIssueReplies,
        notifyWatchlistAvailable,
        setNotifyWatchlistAvailable,
        hideFromLeaderboards,
        setHideFromLeaderboards,
        locale,
        setLocale,
        homeLanding,
        setHomeLanding,
        homeAnalyticsDays,
        setHomeAnalyticsDays,
        homeShowWrapUp,
        setHomeShowWrapUp,
        homeShowWeekCalendar,
        setHomeShowWeekCalendar,
        localPreferences,
        saving,
        message,
        setMessage,
        accountUsername,
        updateLocalPreference,
        saveAccountPrefs,
    };
};

export type UserPreferencesState = ReturnType<typeof useUserPreferences>;
