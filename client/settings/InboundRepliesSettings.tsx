import React, { useState } from 'react';

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

const SetupStep: React.FC<{ n: number; title: string; children: React.ReactNode }> = ({ n, title, children }) => (
    <div className="flex gap-3">
        <div className="shrink-0 w-6 h-6 rounded-full bg-plex/15 text-plex text-xs font-bold flex items-center justify-center mt-0.5">
            {n}
        </div>
        <div className="min-w-0 flex-1 space-y-2">
            <div className="text-sm font-semibold text-text">{title}</div>
            {children}
        </div>
    </div>
);

type InboundRepliesSettingsProps = {
    smtpEnabled: boolean;
    smtpFrom: string;
    publicDomain: string;
    inboundRepliesEnabled: boolean;
    inboundReplyDomain: string;
    inboundReplyReady: boolean;
    onInboundRepliesEnabledChange: (value: boolean) => void;
    onInboundReplyDomainChange: (value: string) => void;
};

export const InboundRepliesSettings: React.FC<InboundRepliesSettingsProps> = ({
    smtpEnabled,
    smtpFrom,
    publicDomain,
    inboundRepliesEnabled,
    inboundReplyDomain,
    inboundReplyReady,
    onInboundRepliesEnabledChange,
    onInboundReplyDomainChange,
}) => {
    const [copiedWebhook, setCopiedWebhook] = useState(false);
    const suggestedDomain = suggestReplyDomain(smtpFrom);
    const webhookUrl = inboundWebhookUrl(publicDomain);
    const effectiveDomain = inboundReplyDomain.trim() || suggestedDomain || 'reply.example.com';
    const disabled = !smtpEnabled;

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
        <SettingsCollapseSection
            title="Portal replies"
            subtitle={inboundRepliesEnabled && smtpEnabled
                ? `Reply-To @ ${effectiveDomain}`
                : 'Off — request and issue mail is send-only'}
            defaultOpen
            headerRight={(
                <label className={`flex items-center gap-2 text-sm text-text ${disabled ? 'opacity-50' : 'cursor-pointer'}`}>
                    <input
                        type="checkbox"
                        checked={smtpEnabled && inboundRepliesEnabled}
                        disabled={disabled}
                        onChange={(event) => onInboundRepliesEnabledChange(event.target.checked)}
                    />
                    <span>On</span>
                </label>
            )}
        >
            <p className="text-sm text-muted mb-4">
                Puts a signed Reply-To on request, available, issue, and Send Test mail so replies land in
                the portal. Newsletter, broadcast, and expiry stay send-only. This is not the Support mailto.
            </p>
            {smtpEnabled && inboundRepliesEnabled ? (
                <div className="space-y-5">
                    <SetupStep n={1} title="Inbound domain">
                        <input
                            className="w-full p-3 rounded-lg border border-border bg-background text-text outline-none focus:border-plex focus:ring-1 focus:ring-plex transition-all"
                            id="inboundReplyDomain"
                            type="text"
                            value={inboundReplyDomain}
                            onChange={(event) => onInboundReplyDomainChange(event.target.value)}
                            placeholder={suggestedDomain || 'reply.example.com'}
                            disabled={disabled}
                        />
                        <p className="text-xs text-muted">
                            Subdomain only — leave apex MX for SMTP. Blank uses {suggestedDomain || 'reply.<From host>'}.
                        </p>
                    </SetupStep>
                    <SetupStep n={2} title="Webhook URL">
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
                                disabled={disabled}
                            >
                                {copiedWebhook ? 'Copied' : 'Copy'}
                            </button>
                        </div>
                        <p className="text-xs text-muted">
                            From Access &amp; Privacy → Public domain. POST JSON: Sender, Recipient, Subject, Text-part.
                        </p>
                    </SetupStep>
                    <SetupStep n={3} title="Catch-all to that webhook">
                        <ul className="text-sm text-muted space-y-1.5 list-disc pl-5">
                            <li>MX on the inbound subdomain only.</li>
                            <li>Catch-all → worker or parser that POSTs the JSON above.</li>
                            <li>Worker env = webhook URL. Sample: <code className="text-text">workers/inbound-email</code>.</li>
                        </ul>
                    </SetupStep>
                    <SetupStep n={4} title="Confirm">
                        <p className="text-sm text-muted">
                            Save, then Send Test below and reply. Settings → Logs should show Inbound Email Received.
                            Signing secret: {inboundReplyReady ? 'ready' : 'missing — restart the portal once after save'}.
                        </p>
                    </SetupStep>
                </div>
            ) : (
                <p className="text-sm text-muted">
                    Turn this on to collect replies in the portal instead of bouncing off the From address.
                </p>
            )}
        </SettingsCollapseSection>
    );
};
