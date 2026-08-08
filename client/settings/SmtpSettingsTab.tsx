import React, { useState } from 'react';

import { SettingHint } from './SettingHint';
import { SettingsCollapseSection } from './SettingsCollapseSection';

const suggestReplyDomain = (smtpFrom: string) => {
    const match = String(smtpFrom || '').match(/@([^>\s]+)/);
    const host = (match?.[1] || '').toLowerCase();
    if (!host) return '';
    return host.startsWith('reply.') ? host : `reply.${host}`;
};

const inboundWebhookUrl = (publicDomain: string) => {
    const base = String(publicDomain || '').trim().replace(/\/+$/, '');
    return `${base || 'https://your-portal.example'}/api/webhooks/inbound-email`;
};

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
}) => {
    const [copiedWebhook, setCopiedWebhook] = useState(false);
    const suggestedDomain = suggestReplyDomain(smtpFrom);
    const webhookUrl = inboundWebhookUrl(publicDomain);
    const effectiveDomain = inboundReplyDomain.trim() || suggestedDomain || 'reply.example.com';

    const copyWebhook = async () => {
        try {
            await navigator.clipboard.writeText(webhookUrl);
            setCopiedWebhook(true);
            window.setTimeout(() => setCopiedWebhook(false), 2000);
        } catch {
            setCopiedWebhook(false);
        }
    };

    return (
        <div className="mb-8 space-y-4">
            <label className="flex items-center gap-3 cursor-pointer mb-4">
                <input type="checkbox" checked={smtpEnabled} onChange={(event) => onSmtpEnabledChange(event.target.checked)} />
                <span className="text-sm text-text">Enable email notifications</span>
            </label>
            <label className={`flex items-center gap-3 cursor-pointer mb-4 ${!smtpEnabled ? 'opacity-50' : ''}`}>
                <input
                    type="checkbox"
                    checked={smtpEnabled && smtpAdminOnly}
                    disabled={!smtpEnabled}
                    onChange={(event) => onSmtpAdminOnlyChange(event.target.checked)}
                />
                <span className="text-sm text-text">Admins only</span>
            </label>
            <div className="mt-1 mb-4">
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
                        <p className="text-xs text-muted mt-2">
                            From is send-only. Portal replies are configured below and do not use Support → public support email.
                        </p>
                    </div>
                    <div className="form-group flex-1 checkbox-group">
                        <label htmlFor="smtpSecure" className="flex items-center gap-2 cursor-pointer select-none text-muted hover:text-text transition-colors">
                            <input className="w-full p-3 rounded-lg border border-border bg-background text-text outline-none focus:border-plex focus:ring-1 focus:ring-plex transition-all" id="smtpSecure" type="checkbox" checked={smtpSecure} onChange={e => onSmtpSecureChange(e.target.checked)} disabled={!smtpEnabled} />
                            <span>SSL / Secure</span>
                        </label>
                    </div>
                </div>
                <div className="mb-4">
                    <label htmlFor="emailDaysBefore">Warning Alert Threshold (Days Before Expiry)</label>
                    <input className="w-full p-3 rounded-lg border border-border bg-background text-text outline-none focus:border-plex focus:ring-1 focus:ring-plex transition-all" id="emailDaysBefore" type="number" value={emailDaysBefore} onChange={e => onEmailDaysBeforeChange(Number(e.target.value))} min="0" disabled={!smtpEnabled} />
                    <div className="mt-2">
                        <SettingHint>Automated notification email will be sent when user has this many days left.</SettingHint>
                    </div>
                </div>

                <SettingsCollapseSection
                    title="Portal replies"
                    subtitle={inboundRepliesEnabled ? `Reply-To @ ${effectiveDomain}` : 'Off — members cannot reply into the portal'}
                    defaultOpen
                >
                    <label className="flex items-center gap-3 cursor-pointer mb-4">
                        <input
                            type="checkbox"
                            checked={inboundRepliesEnabled}
                            disabled={!smtpEnabled}
                            onChange={(event) => onInboundRepliesEnabledChange(event.target.checked)}
                        />
                        <span className="text-sm text-text">Route request and issue replies into the portal</span>
                    </label>
                    <p className="text-sm text-muted mb-4">
                        When on, request approved, available, issue, and Send Test mail use a signed Reply-To
                        on a dedicated inbound domain. Newsletter, broadcast, and expiry stay send-only.
                        Any catch-all that POSTs JSON to the webhook below will work — Cloudflare Email Routing
                        plus the sample worker in <code className="text-text">workers/inbound-email</code> is one option.
                    </p>
                    <div className="mb-4">
                        <label htmlFor="inboundReplyDomain">Inbound reply domain</label>
                        <input
                            className="w-full p-3 rounded-lg border border-border bg-background text-text outline-none focus:border-plex focus:ring-1 focus:ring-plex transition-all"
                            id="inboundReplyDomain"
                            type="text"
                            value={inboundReplyDomain}
                            onChange={(event) => onInboundReplyDomainChange(event.target.value)}
                            placeholder={suggestedDomain || 'reply.example.com'}
                            disabled={!smtpEnabled || !inboundRepliesEnabled}
                        />
                        <p className="text-xs text-muted mt-2">
                            Use a subdomain so apex MX stays with outbound SMTP. Leave blank to use
                            {' '}{suggestedDomain || 'reply.<your From host>'}.
                        </p>
                    </div>
                    <div className="mb-4">
                        <label htmlFor="inboundWebhookUrl">Inbound webhook URL</label>
                        <div className="flex flex-col sm:flex-row gap-2">
                            <input
                                id="inboundWebhookUrl"
                                className="w-full p-3 rounded-lg border border-border bg-background text-text outline-none"
                                type="text"
                                value={webhookUrl}
                                readOnly
                            />
                            <button
                                type="button"
                                className="px-4 py-2 bg-border text-text rounded-md font-medium hover:bg-opacity-80 transition-colors whitespace-nowrap"
                                onClick={copyWebhook}
                                disabled={!smtpEnabled}
                            >
                                {copiedWebhook ? 'Copied' : 'Copy'}
                            </button>
                        </div>
                        <p className="text-xs text-muted mt-2">
                            Built from Access &amp; Privacy → Public domain. Point Email Routing / Parse / a
                            worker at this URL. Payload fields: Sender, Recipient, Subject, Text-part.
                        </p>
                    </div>
                    <ol className="text-sm text-muted space-y-2 list-decimal pl-5 mb-3">
                        <li>Create DNS for the inbound domain (MX only on that subdomain).</li>
                        <li>Catch-all forward every address to a worker or parser that POSTs the JSON above.</li>
                        <li>Set the worker env to this webhook URL. Sample: <code className="text-text">workers/inbound-email</code>.</li>
                        <li>Save, Send Test, reply, then check Settings → Logs for Inbound Email Received.</li>
                    </ol>
                    <p className="text-xs text-muted">
                        Signing secret: {inboundReplyReady ? 'ready (generated on first boot)' : 'missing — restart the portal once after save'}.
                    </p>
                </SettingsCollapseSection>

                <div className="mt-6 space-y-3">
                    <h4 className="font-bold text-text">Test SMTP Settings</h4>
                    <div className="flex flex-col md:flex-row gap-4 mb-4">
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
                        Preview HTML opens every template in the browser. With portal replies on, Send Test
                        includes a Reply-To — reply and look in Settings → Logs.
                    </SettingHint>
                </div>
            </div>
        </div>
    );
};
