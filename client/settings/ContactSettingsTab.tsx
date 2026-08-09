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
            title="Need Help box"
            subtitle="Public member dashboard — this can expose your inbox"
            defaultOpen
        >
            <p className="text-sm text-muted mb-4">
                Members see Discord (if enabled) and an Email button when an address is set.
                That button is a normal mailto to the address below. Leave it empty to hide Email
                and keep support in Discord or in-portal issues.
            </p>
            <div className="mb-4">
                <label htmlFor="contactEmail">Public support email</label>
                <input className="w-full p-3 rounded-lg border border-border bg-background text-text outline-none focus:border-plex focus:ring-1 focus:ring-plex transition-all" id="contactEmail" type="email" value={contactEmail} onChange={(e) => onContactEmailChange(e.target.value)} placeholder="e.g. admin@example.com" />
                <div className="mt-2">
                    <SettingHint>
                        Also the owner inbox for playback reports. Request and issue Reply-To is under
                        Email Delivery → Portal replies, not this address.
                    </SettingHint>
                </div>
            </div>
            <div>
                <label htmlFor="contactUrl">Access extension link</label>
                <input className="w-full p-3 rounded-lg border border-border bg-background text-text outline-none focus:border-plex focus:ring-1 focus:ring-plex transition-all" id="contactUrl" type="text" value={contactUrl} onChange={(event) => onContactUrlChange(event.target.value)} placeholder="https://discord.gg/… or mailto:admin@example.com" />
                <div className="mt-2">
                    <SettingHint>
                        Request Extension button in expiry emails. If empty, those emails fall back
                        to the public support email.
                    </SettingHint>
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
