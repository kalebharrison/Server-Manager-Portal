import React from 'react';

import { InboundRepliesSettings } from './InboundRepliesSettings';
import { SettingHint } from './SettingHint';
import { SettingsCollapseSection } from './SettingsCollapseSection';

type SmtpSettingsTabProps = {
    smtpEnabled: boolean;
    smtpAdminOnly: boolean;
    smtpHost: string;
    smtpPort: number;
    smtpUser: string;
    smtpPass: string;
    smtpFrom: string;
    smtpSecure: boolean;
    emailDaysBefore: number;
    inboundRepliesEnabled: boolean;
    inboundReplyDomain: string;
    inboundReplyReady: boolean;
    publicDomain: string;
    testRecipient: string;
    isTestingSmtp: boolean;
    isSendingAllMocks: boolean;
    onSmtpEnabledChange: (value: boolean) => void;
    onSmtpAdminOnlyChange: (value: boolean) => void;
    onSmtpHostChange: (value: string) => void;
    onSmtpPortChange: (value: number) => void;
    onSmtpUserChange: (value: string) => void;
    onSmtpPassChange: (value: string) => void;
    onSmtpFromChange: (value: string) => void;
    onSmtpSecureChange: (value: boolean) => void;
    onEmailDaysBeforeChange: (value: number) => void;
    onInboundRepliesEnabledChange: (value: boolean) => void;
    onInboundReplyDomainChange: (value: string) => void;
    onTestRecipientChange: (value: string) => void;
    onTestEmail: () => void;
    onSendAllMockEmails: () => void;
    onPreviewEmails: () => void;
};

export const SmtpSettingsTab: React.FC<SmtpSettingsTabProps> = ({
    smtpEnabled,
    smtpAdminOnly,
    smtpHost,
    smtpPort,
    smtpUser,
    smtpPass,
    smtpFrom,
    smtpSecure,
    emailDaysBefore,
    inboundRepliesEnabled,
    inboundReplyDomain,
    inboundReplyReady,
    publicDomain,
    testRecipient,
    isTestingSmtp,
    isSendingAllMocks,
    onSmtpEnabledChange,
    onSmtpAdminOnlyChange,
    onSmtpHostChange,
    onSmtpPortChange,
    onSmtpUserChange,
    onSmtpPassChange,
    onSmtpFromChange,
    onSmtpSecureChange,
    onEmailDaysBeforeChange,
    onInboundRepliesEnabledChange,
    onInboundReplyDomainChange,
    onTestRecipientChange,
    onTestEmail,
    onSendAllMockEmails,
    onPreviewEmails,
}) => (
    <div className="mb-8 animate-fade-in space-y-4">
        <SettingsCollapseSection
            title="Outbound SMTP"
            subtitle={smtpEnabled ? (smtpHost || 'Enabled') : 'Off'}
            defaultOpen
            headerRight={(
                <label className="flex items-center gap-2 text-sm text-text cursor-pointer">
                    <input type="checkbox" checked={smtpEnabled} onChange={(event) => onSmtpEnabledChange(event.target.checked)} />
                    <span>On</span>
                </label>
            )}
        >
            <label className={`flex items-center gap-3 cursor-pointer mb-4 ${!smtpEnabled ? 'opacity-50' : ''}`}>
                <input
                    type="checkbox"
                    checked={smtpEnabled && smtpAdminOnly}
                    disabled={!smtpEnabled}
                    onChange={(event) => onSmtpAdminOnlyChange(event.target.checked)}
                />
                <span className="text-sm text-text">Admins only</span>
            </label>
            <div className="mb-4">
                <SettingHint>
                    Master switch for outbound mail. Admins only skips member addresses while you test. SMTP tests still send to the address you type. Member notices go to each user's contact email, then account email. Playback reports go to Support → public support email. Discord DMs keep working either way.
                </SettingHint>
            </div>
            <div className={!smtpEnabled ? 'opacity-50 pointer-events-none' : undefined}>
                <div className="flex flex-col md:flex-row gap-4 mb-4">
                    <div className="flex-2">
                        <label htmlFor="smtpHost">SMTP Host</label>
                        <input className="w-full p-3 rounded-lg border border-border bg-background text-text outline-none focus:border-plex focus:ring-1 focus:ring-plex transition-all" id="smtpHost" type="text" value={smtpHost} onChange={e => onSmtpHostChange(e.target.value)} placeholder="smtp.mailgun.org" disabled={!smtpEnabled} />
                    </div>
                    <div className="flex-1">
                        <label htmlFor="smtpPort">Port</label>
                        <input className="w-full p-3 rounded-lg border border-border bg-background text-text outline-none focus:border-plex focus:ring-1 focus:ring-plex transition-all" id="smtpPort" type="number" value={smtpPort} onChange={e => onSmtpPortChange(Number(e.target.value))} placeholder="587" disabled={!smtpEnabled} />
                    </div>
                </div>
                <div className="flex flex-col md:flex-row gap-4 mb-4">
                    <div className="flex-1">
                        <label htmlFor="smtpUser">SMTP Username</label>
                        <input className="w-full p-3 rounded-lg border border-border bg-background text-text outline-none focus:border-plex focus:ring-1 focus:ring-plex transition-all" id="smtpUser" type="text" value={smtpUser} onChange={e => onSmtpUserChange(e.target.value)} placeholder="postmaster@yourdomain.com" disabled={!smtpEnabled} />
                    </div>
                    <div className="flex-1">
                        <label htmlFor="smtpPass">SMTP Password</label>
                        <input className="w-full p-3 rounded-lg border border-border bg-background text-text outline-none focus:border-plex focus:ring-1 focus:ring-plex transition-all" id="smtpPass" type="password" value={smtpPass} onChange={e => onSmtpPassChange(e.target.value)} placeholder="••••••••••••" disabled={!smtpEnabled} />
                    </div>
                </div>
                <div className="flex flex-col md:flex-row gap-4 mb-4">
                    <div className="flex-2">
                        <label htmlFor="smtpFrom">Sender Address (From)</label>
                        <input className="w-full p-3 rounded-lg border border-border bg-background text-text outline-none focus:border-plex focus:ring-1 focus:ring-plex transition-all" id="smtpFrom" type="text" value={smtpFrom} onChange={e => onSmtpFromChange(e.target.value)} placeholder="Server Manager Portal <noreply@yourdomain.com>" disabled={!smtpEnabled} />
                        <p className="text-xs text-muted mt-2">Send-only. Portal Reply-To is configured in Portal replies below.</p>
                    </div>
                    <div className="form-group flex-1 checkbox-group">
                        <label htmlFor="smtpSecure" className="flex items-center gap-2 cursor-pointer select-none text-muted hover:text-text transition-colors">
                            <input className="w-full p-3 rounded-lg border border-border bg-background text-text outline-none focus:border-plex focus:ring-1 focus:ring-plex transition-all" id="smtpSecure" type="checkbox" checked={smtpSecure} onChange={e => onSmtpSecureChange(e.target.checked)} disabled={!smtpEnabled} />
                            <span>SSL / Secure</span>
                        </label>
                    </div>
                </div>
                <div>
                    <label htmlFor="emailDaysBefore">Warning Alert Threshold (Days Before Expiry)</label>
                    <input className="w-full p-3 rounded-lg border border-border bg-background text-text outline-none focus:border-plex focus:ring-1 focus:ring-plex transition-all" id="emailDaysBefore" type="number" value={emailDaysBefore} onChange={e => onEmailDaysBeforeChange(Number(e.target.value))} min="0" disabled={!smtpEnabled} />
                    <div className="mt-2">
                        <SettingHint>Automated notification email will be sent when user has this many days left.</SettingHint>
                    </div>
                </div>
            </div>
        </SettingsCollapseSection>

        <div className={!smtpEnabled ? 'opacity-50 pointer-events-none' : undefined}>
            <InboundRepliesSettings
                smtpEnabled={smtpEnabled}
                smtpFrom={smtpFrom}
                publicDomain={publicDomain}
                inboundRepliesEnabled={inboundRepliesEnabled}
                inboundReplyDomain={inboundReplyDomain}
                inboundReplyReady={inboundReplyReady}
                onInboundRepliesEnabledChange={onInboundRepliesEnabledChange}
                onInboundReplyDomainChange={onInboundReplyDomainChange}
            />
        </div>

        <SettingsCollapseSection
            title="Test & preview"
            subtitle={inboundRepliesEnabled && smtpEnabled ? 'Send Test includes inbound Reply-To' : 'Outbound only'}
            defaultOpen
        >
            <div className={!smtpEnabled ? 'opacity-50 pointer-events-none' : undefined}>
                <div className="flex flex-col md:flex-row gap-4 mb-3">
                    <input
                        type="email"
                        value={testRecipient}
                        onChange={e => onTestRecipientChange(e.target.value)}
                        placeholder="test-recipient@gmail.com"
                        className="flex-grow p-3 rounded-lg border border-border bg-background text-text text-sm outline-none focus:border-plex focus:ring-1 focus:ring-plex transition-all"
                        disabled={!smtpEnabled}
                    />
                    <button className="px-4 py-2 bg-border text-text rounded-md font-medium hover:bg-opacity-80 transition-colors flex items-center justify-center gap-2" onClick={onTestEmail} disabled={!smtpEnabled || isTestingSmtp || isSendingAllMocks || !testRecipient}>
                        {isTestingSmtp ? 'Sending...' : 'Send Test'}
                    </button>
                    <button className="px-4 py-2 bg-plex text-white rounded-md font-medium hover:bg-opacity-90 transition-colors flex items-center justify-center gap-2 whitespace-nowrap" onClick={onPreviewEmails}>
                        Preview HTML
                    </button>
                    <button className="px-4 py-2 bg-border text-text rounded-md font-medium hover:bg-opacity-80 transition-colors flex items-center justify-center gap-2 whitespace-nowrap" onClick={onSendAllMockEmails} disabled={!smtpEnabled || isTestingSmtp || isSendingAllMocks || !testRecipient}>
                        {isSendingAllMocks ? 'Sending mocks...' : 'Send all mock emails'}
                    </button>
                </div>
                <SettingHint>
                    Preview HTML opens every template in the browser. With portal replies on, reply to Send Test and check Settings → Logs.
                </SettingHint>
            </div>
        </SettingsCollapseSection>
    </div>
);
