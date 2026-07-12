import React from 'react';

import { SettingHint } from './SettingHint';

type ContactSettingsTabProps = {
    contactWhatsApp: string;
    contactEmail: string;
    contactUrl: string;
    announcement: string;
    isPushingAnnouncement: boolean;
    onContactWhatsAppChange: (value: string) => void;
    onContactEmailChange: (value: string) => void;
    onContactUrlChange: (value: string) => void;
    onAnnouncementChange: (value: string) => void;
    onPushAnnouncement: () => void;
};

export const ContactSettingsTab: React.FC<ContactSettingsTabProps> = ({
    contactWhatsApp,
    contactEmail,
    contactUrl,
    announcement,
    isPushingAnnouncement,
    onContactWhatsAppChange,
    onContactEmailChange,
    onContactUrlChange,
    onAnnouncementChange,
    onPushAnnouncement,
}) => (
    <div className="mb-8">
        <h3 className="text-xl font-bold text-plex mb-4 border-b border-border pb-2">Contact Details</h3>
        <p className="text-sm text-muted mb-6">
            These details are displayed in the "Need Help?" box on the User Dashboard. Users can click these buttons to contact you directly if they need to extend their access, report an issue, or request support.
        </p>
        <div className="mb-4">
            <label htmlFor="contactWhatsApp">WhatsApp Number (Optional)</label>
            <input className="w-full p-3 rounded-lg border border-border bg-background text-text outline-none focus:border-plex focus:ring-1 focus:ring-plex transition-all" id="contactWhatsApp" type="text" value={contactWhatsApp} onChange={(e) => onContactWhatsAppChange(e.target.value)} placeholder="e.g. 447303647923" />
            <div className="mt-2">
                <SettingHint>Enter your phone number including country code, without any '+', spaces, or dashes. If left blank, the WhatsApp button will be hidden.</SettingHint>
            </div>
        </div>
        <div className="mb-4">
            <label htmlFor="contactEmail">Email Address (Optional)</label>
            <input className="w-full p-3 rounded-lg border border-border bg-background text-text outline-none focus:border-plex focus:ring-1 focus:ring-plex transition-all" id="contactEmail" type="email" value={contactEmail} onChange={(e) => onContactEmailChange(e.target.value)} placeholder="e.g. admin@example.com" />
            <div className="mt-2">
                <SettingHint>The email address users should contact. If left blank, the Email button will be hidden.</SettingHint>
            </div>
        </div>
        <div className="mb-4">
            <label htmlFor="contactUrl">Access Extension Link (Optional)</label>
            <input className="w-full p-3 rounded-lg border border-border bg-background text-text outline-none focus:border-plex focus:ring-1 focus:ring-plex transition-all" id="contactUrl" type="text" value={contactUrl} onChange={(event) => onContactUrlChange(event.target.value)} placeholder="mailto:admin@example.com or https://example.com/support" />
            <div className="mt-2"><SettingHint>Destination used by the Request Extension button in expiry emails.</SettingHint></div>
        </div>

        <h3 className="text-xl font-bold text-plex mb-4 border-b border-border pb-2 mt-8">Portal Announcement</h3>
        <div className="mb-4">
            <label htmlFor="portalAnnouncement">Announcement Banner</label>
            <textarea id="portalAnnouncement" className="w-full p-3 rounded-lg border border-border bg-background text-text outline-none focus:border-plex transition-all" value={announcement} onChange={(event) => onAnnouncementChange(event.target.value)} placeholder="Server maintenance scheduled for Friday..." rows={3} />
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 mt-2">
                <SettingHint>Saving settings publishes the banner. Use the button to also email all eligible members.</SettingHint>
                <button type="button" onClick={onPushAnnouncement} disabled={isPushingAnnouncement || !announcement.trim()} className="bg-plex hover:bg-plex-hover disabled:opacity-50 text-background font-bold py-2 px-4 rounded-lg transition-colors text-sm whitespace-nowrap">
                    {isPushingAnnouncement ? 'Sending...' : 'Publish & Email Members'}
                </button>
            </div>
        </div>
    </div>
);
