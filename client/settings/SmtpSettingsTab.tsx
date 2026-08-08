import React from 'react';

import { SettingHint } from './SettingHint';

type SmtpSettingsTabProps = {
    smtpHost: string;
    smtpPort: number;
    smtpUser: string;
    smtpPass: string;
    smtpFrom: string;
    smtpSecure: boolean;
    emailDaysBefore: number;
    testRecipient: string;
    isTestingSmtp: boolean;
    onSmtpHostChange: (value: string) => void;
    onSmtpPortChange: (value: number) => void;
    onSmtpUserChange: (value: string) => void;
    onSmtpPassChange: (value: string) => void;
    onSmtpFromChange: (value: string) => void;
    onSmtpSecureChange: (value: boolean) => void;
    onEmailDaysBeforeChange: (value: number) => void;
    onTestRecipientChange: (value: string) => void;
    onTestEmail: () => void;
};

export const SmtpSettingsTab: React.FC<SmtpSettingsTabProps> = ({
    smtpHost,
    smtpPort,
    smtpUser,
    smtpPass,
    smtpFrom,
    smtpSecure,
    emailDaysBefore,
    testRecipient,
    isTestingSmtp,
    onSmtpHostChange,
    onSmtpPortChange,
    onSmtpUserChange,
    onSmtpPassChange,
    onSmtpFromChange,
    onSmtpSecureChange,
    onEmailDaysBeforeChange,
    onTestRecipientChange,
    onTestEmail,
}) => (
    <div className="mb-8">
        <div className="flex flex-col md:flex-row gap-4 mb-4">
            <div className="flex-2">
                <label htmlFor="smtpHost">SMTP Host</label>
                <input className="w-full p-3 rounded-lg border border-border bg-background text-text outline-none focus:border-plex focus:ring-1 focus:ring-plex transition-all" id="smtpHost" type="text" value={smtpHost} onChange={e => onSmtpHostChange(e.target.value)} placeholder="smtp.mailgun.org" />
            </div>
            <div className="flex-1">
                <label htmlFor="smtpPort">Port</label>
                <input className="w-full p-3 rounded-lg border border-border bg-background text-text outline-none focus:border-plex focus:ring-1 focus:ring-plex transition-all" id="smtpPort" type="number" value={smtpPort} onChange={e => onSmtpPortChange(Number(e.target.value))} placeholder="587" />
            </div>
        </div>
        <div className="flex flex-col md:flex-row gap-4 mb-4">
            <div className="flex-1">
                <label htmlFor="smtpUser">SMTP Username</label>
                <input className="w-full p-3 rounded-lg border border-border bg-background text-text outline-none focus:border-plex focus:ring-1 focus:ring-plex transition-all" id="smtpUser" type="text" value={smtpUser} onChange={e => onSmtpUserChange(e.target.value)} placeholder="postmaster@yourdomain.com" />
            </div>
            <div className="flex-1">
                <label htmlFor="smtpPass">SMTP Password</label>
                <input className="w-full p-3 rounded-lg border border-border bg-background text-text outline-none focus:border-plex focus:ring-1 focus:ring-plex transition-all" id="smtpPass" type="password" value={smtpPass} onChange={e => onSmtpPassChange(e.target.value)} placeholder="••••••••••••" />
            </div>
        </div>
        <div className="flex flex-col md:flex-row gap-4 mb-4">
            <div className="flex-2">
                <label htmlFor="smtpFrom">Sender Address (From)</label>
                <input className="w-full p-3 rounded-lg border border-border bg-background text-text outline-none focus:border-plex focus:ring-1 focus:ring-plex transition-all" id="smtpFrom" type="text" value={smtpFrom} onChange={e => onSmtpFromChange(e.target.value)} placeholder="Server Manager Portal <noreply@yourdomain.com>" />
            </div>
            <div className="form-group flex-1 checkbox-group">
                <label htmlFor="smtpSecure" className="flex items-center gap-2 cursor-pointer select-none text-muted hover:text-text transition-colors">
                    <input className="w-full p-3 rounded-lg border border-border bg-background text-text outline-none focus:border-plex focus:ring-1 focus:ring-plex transition-all" id="smtpSecure" type="checkbox" checked={smtpSecure} onChange={e => onSmtpSecureChange(e.target.checked)} />
                    <span>SSL / Secure</span>
                </label>
            </div>
        </div>
        <div className="mb-4">
            <label htmlFor="emailDaysBefore">Warning Alert Threshold (Days Before Expiry)</label>
            <input className="w-full p-3 rounded-lg border border-border bg-background text-text outline-none focus:border-plex focus:ring-1 focus:ring-plex transition-all" id="emailDaysBefore" type="number" value={emailDaysBefore} onChange={e => onEmailDaysBeforeChange(Number(e.target.value))} min="0" />
            <div className="mt-2">
                <SettingHint>Automated notification email will be sent when user has this many days left.</SettingHint>
            </div>
        </div>

        <div className="mt-6 space-y-3">
            <h4 className="font-bold text-text">Test SMTP Settings</h4>
            <div className="flex flex-col md:flex-row gap-4 mb-4">
                <input
                    type="email"
                    value={testRecipient}
                    onChange={e => onTestRecipientChange(e.target.value)}
                    placeholder="test-recipient@gmail.com"
                    className="flex-grow p-3 rounded-lg border border-border bg-background text-text text-sm outline-none focus:border-plex focus:ring-1 focus:ring-plex transition-all"
                />
                <button className="px-4 py-2 bg-border text-text rounded-md font-medium hover:bg-opacity-80 transition-colors flex items-center justify-center gap-2" onClick={onTestEmail} disabled={isTestingSmtp || !testRecipient}>
                    {isTestingSmtp ? 'Sending...' : 'Send Test'}
                </button>
            </div>
        </div>
    </div>
);
