import React from 'react';

import { SettingHint } from './SettingHint';
import { SettingsCollapseSection } from './SettingsCollapseSection';

type ContactSettingsTabProps = {
    contactEmail: string;
    contactUrl: string;
    announcement: string;
    isPushingAnnouncement: boolean;
    onContactEmailChange: (value: string) => void;
    onContactUrlChange: (value: string) => void;
    onAnnouncementChange: (value: string) => void;
    onPushAnnouncement: () => void;
};

export const ContactSettingsTab: React.FC<ContactSettingsTabProps> = ({
    contactEmail,
    contactUrl,
    announcement,
    isPushingAnnouncement,
    onContactEmailChange,
    onContactUrlChange,
    onAnnouncementChange,
    onPushAnnouncement,
}) => (
    <div className="mb-8 animate-fade-in space-y-4">
        <SettingsCollapseSection
            title="Contact Details"
            subtitle="Shown in the Need Help box on the user dashboard"
        >
            <div className="mb-4">
                <label htmlFor="contactEmail">Email Address (Optional)</label>
                <input className="w-full p-3 rounded-lg border border-border bg-background text-text outline-none focus:border-plex focus:ring-1 focus:ring-plex transition-all" id="contactEmail" type="email" value={contactEmail} onChange={(e) => onContactEmailChange(e.target.value)} placeholder="e.g. admin@example.com" />
                <div className="mt-2">
                    <SettingHint>Owner inbox. Playback reports, expiry replies, and Reply-To use this — not the SMTP username.</SettingHint>
                </div>
            </div>
            <div>
                <label htmlFor="contactUrl">Access Extension Link (Optional)</label>
                <input className="w-full p-3 rounded-lg border border-border bg-background text-text outline-none focus:border-plex focus:ring-1 focus:ring-plex transition-all" id="contactUrl" type="text" value={contactUrl} onChange={(event) => onContactUrlChange(event.target.value)} placeholder="mailto:admin@example.com or https://example.com/support" />
                <div className="mt-2">
                    <SettingHint>Destination used by the Request Extension button in expiry emails.</SettingHint>
                </div>
            </div>
        </SettingsCollapseSection>

        <SettingsCollapseSection
            title="Portal Announcement"
            subtitle={announcement.trim() ? 'Banner text set' : 'No banner'}
        >
            <label htmlFor="portalAnnouncement">Announcement Banner</label>
            <textarea id="portalAnnouncement" className="w-full p-3 rounded-lg border border-border bg-background text-text outline-none focus:border-plex transition-all" value={announcement} onChange={(event) => onAnnouncementChange(event.target.value)} placeholder="Server maintenance scheduled for Friday..." rows={3} />
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 mt-2">
                <SettingHint>
                    Save publishes the banner. Publish &amp; email also sends to eligible members.
                </SettingHint>
                <button type="button" onClick={onPushAnnouncement} disabled={isPushingAnnouncement || !announcement.trim()} className="bg-plex hover:bg-plex-hover disabled:opacity-50 text-background font-bold py-2 px-4 rounded-lg transition-colors text-sm whitespace-nowrap">
                    {isPushingAnnouncement ? 'Sending...' : 'Publish banner & email members'}
                </button>
            </div>
        </SettingsCollapseSection>
    </div>
);
