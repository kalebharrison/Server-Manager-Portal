import React from 'react';

import { SettingHint } from './SettingHint';

type ContactSettingsTabProps = {
    contactWhatsApp: string;
    contactEmail: string;
    onContactWhatsAppChange: (value: string) => void;
    onContactEmailChange: (value: string) => void;
};

export const ContactSettingsTab: React.FC<ContactSettingsTabProps> = ({
    contactWhatsApp,
    contactEmail,
    onContactWhatsAppChange,
    onContactEmailChange,
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
    </div>
);
