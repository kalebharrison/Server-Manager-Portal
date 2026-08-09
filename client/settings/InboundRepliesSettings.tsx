import React, { useState } from 'react';

import { apiFetch } from '../shared/api';
import { appConfirm } from '../shared/confirm';
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
    const [copiedToken, setCopiedToken] = useState(false);
    const [token, setToken] = useState('');
    const [tokenVisible, setTokenVisible] = useState(false);
    const [tokenBusy, setTokenBusy] = useState(false);
    const suggestedDomain = suggestReplyDomain(smtpFrom);
    const webhookUrl = inboundWebhookUrl(publicDomain);
    const effectiveDomain = inboundReplyDomain.trim() || suggestedDomain || 'reply.example.com';
    const disabled = !smtpEnabled;

    const flashCopied = (setter: (value: boolean) => void) => {
        setter(true);
        window.setTimeout(() => setter(false), 2000);
    };

    const copyWebhook = async () => {
        try {
            await navigator.clipboard.writeText(webhookUrl);
            flashCopied(setCopiedWebhook);
        } catch {
            setCopiedWebhook(false);
        }
    };

    const loadToken = async () => {
        const result = await apiFetch('/api/config/inbound-webhook-token', { forceRefresh: true });
        const value = String(result?.token || '');
        setToken(value);
        return value;
    };

    const revealToken = async () => {
        if (tokenVisible) {
            setTokenVisible(false);
            return;
        }
        setTokenBusy(true);
        try {
            await loadToken();
            setTokenVisible(true);
        } catch {
            setTokenVisible(false);
        } finally {
            setTokenBusy(false);
        }
    };

    const copyToken = async () => {
        setTokenBusy(true);
        try {
            const value = token || await loadToken();
            if (!value) return;
            await navigator.clipboard.writeText(value);
            flashCopied(setCopiedToken);
        } catch {
            setCopiedToken(false);
        } finally {
            setTokenBusy(false);
        }
    };

    const rotateToken = () => {
        appConfirm('Rotate the inbound webhook token? The Email Worker secret must be updated to match or replies will 401.', async () => {
            setTokenBusy(true);
            try {
                const result = await apiFetch('/api/config/inbound-webhook-token/rotate', { method: 'POST', forceRefresh: true });
                const value = String(result?.token || '');
                setToken(value);
                setTokenVisible(true);
            } finally {
                setTokenBusy(false);
            }
        });
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
                    <SetupStep n={2} title="Webhook URL + token">
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
                                {copiedWebhook ? 'Copied' : 'Copy URL'}
                            </button>
                        </div>
                        <div className="flex flex-col sm:flex-row gap-2">
                            <input
                                id="inboundWebhookToken"
                                className="w-full p-3 rounded-lg border border-border bg-background text-text outline-none font-mono text-sm"
                                type={tokenVisible ? 'text' : 'password'}
                                value={tokenVisible ? token : '••••••••••••••••••••••••••••••••'}
                                readOnly
                            />
                            <button type="button" className="px-4 py-2 bg-border text-text rounded-md font-medium hover:bg-opacity-80 transition-colors whitespace-nowrap" onClick={revealToken} disabled={disabled || tokenBusy}>
                                {tokenVisible ? 'Hide' : 'Reveal'}
                            </button>
                            <button type="button" className="px-4 py-2 bg-border text-text rounded-md font-medium hover:bg-opacity-80 transition-colors whitespace-nowrap" onClick={copyToken} disabled={disabled || tokenBusy}>
                                {copiedToken ? 'Copied' : 'Copy token'}
                            </button>
                            <button type="button" className="px-4 py-2 bg-border text-text rounded-md font-medium hover:bg-opacity-80 transition-colors whitespace-nowrap" onClick={rotateToken} disabled={disabled || tokenBusy}>
                                Rotate
                            </button>
                        </div>
                        <p className="text-xs text-muted">
                            POST JSON with <code className="text-text">Authorization: Bearer &lt;token&gt;</code> (or
                            {' '}<code className="text-text">X-Portal-Inbound-Token</code>). Public domain comes from Access &amp; Privacy.
                        </p>
                    </SetupStep>
                    <SetupStep n={3} title="Catch-all to that webhook">
                        <ul className="text-sm text-muted space-y-1.5 list-disc pl-5">
                            <li>MX on the inbound subdomain only.</li>
                            <li>Catch-all → worker or parser that POSTs Sender, Recipient, Subject, Text-part.</li>
                            <li>Worker env: <code className="text-text">PORTAL_WEBHOOK_URL</code> + secret <code className="text-text">PORTAL_WEBHOOK_TOKEN</code>. Sample: <code className="text-text">workers/inbound-email</code>.</li>
                        </ul>
                    </SetupStep>
                    <SetupStep n={4} title="Confirm">
                        <p className="text-sm text-muted">
                            Save, then Send Test below and reply. Settings → Logs should show Inbound Email Received.
                            Reply-To signing secret: {inboundReplyReady ? 'ready' : 'missing — restart the portal once after save'}.
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
