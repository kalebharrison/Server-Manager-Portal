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
        notifyRequestUpdates,
        setNotifyRequestUpdates,
        notifyIssueReplies,
        setNotifyIssueReplies,
        notifyWatchlistAvailable,
        setNotifyWatchlistAvailable,
        saving,
        saveAccountPrefs,
    } = prefs;

    if (!account) return null;

    return (
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
                    <p className="text-xs text-muted mt-1">Email when approved or declined. Linked Discord IDs also get a bot DM.</p>
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
                    <p className="text-xs text-muted mt-1">When a title you requested — or chose Notify on — becomes available to watch</p>
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
    );
};
