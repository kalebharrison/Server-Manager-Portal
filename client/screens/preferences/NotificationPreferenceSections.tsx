import React from 'react';
import { Mail } from 'lucide-react';
import { ToggleRow } from './shared';
import type { SectionProps } from './types';

export const EmailNotificationsSection: React.FC<SectionProps> = ({ account, readOnly, prefs }) => {
    const {
        newsletterEnabled,
        setNewsletterEnabled,
        notifyAccessExpiry,
        setNotifyAccessExpiry,
        saving,
        saveAccountPrefs,
    } = prefs;

    if (!account) return null;

    return (
        <section className="p-5 flex flex-col gap-4">
            <div className="flex gap-3">
                <Mail className="w-5 h-5 text-plex mt-0.5" />
                <div>
                    <h2 className="font-bold text-text">Email notifications</h2>
                    <p className="text-sm text-muted mt-1">Request and issue updates are emailed when the server has email on. Link Discord under Preferences to also get bot DMs. Newsletter and expiry notices stay opt-in.</p>
                </div>
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
        </section>
    );
};
