import React from 'react';
import { EyeOff, UserRound } from 'lucide-react';
import { sanitizeContactEmail, sanitizeDisplayName } from '../../shared/userProfile';
import { ToggleRow } from './shared';
import type { SectionProps } from './types';

export const ProfileSection: React.FC<SectionProps> = ({ account, readOnly, prefs }) => {
    const {
        displayName,
        setDisplayName,
        contactEmail,
        setContactEmail,
        saving,
        setMessage,
        accountUsername,
        saveAccountPrefs,
    } = prefs;

    if (!account) return null;

    return (
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
    );
};

export const LeaderboardSection: React.FC<SectionProps> = ({ account, readOnly, prefs }) => {
    const { hideFromLeaderboards, setHideFromLeaderboards, saving, saveAccountPrefs } = prefs;
    if (!account) return null;

    return (
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
    );
};
