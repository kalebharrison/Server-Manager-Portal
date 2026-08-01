import React, { useState } from 'react';
import { Copy, Eye, KeyRound, RefreshCw } from 'lucide-react';

import { apiFetch } from '../shared/api';

export const DiscordAgentKeySection: React.FC = () => {
    const [key, setKey] = useState('');
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');

    const reveal = async () => {
        setBusy(true);
        setError('');
        setMessage('');
        try {
            const data = await apiFetch('/api/config/portal-agent-key', { forceRefresh: true });
            setKey(String(data?.key || ''));
            setMessage(data?.created
                ? 'Generated a new portal agent key (saved encrypted in config).'
                : 'Key loaded from config.');
        } catch (loadError: any) {
            setError(loadError?.message || 'Could not load portal agent key.');
        } finally {
            setBusy(false);
        }
    };

    const regenerate = async () => {
        if (!window.confirm('Regenerate the portal agent key? Update .local/portal-agent.env afterward.')) return;
        setBusy(true);
        setError('');
        setMessage('');
        try {
            const data = await apiFetch('/api/config/portal-agent-key/regenerate', {
                method: 'POST',
                forceRefresh: true,
            });
            setKey(String(data?.key || ''));
            setMessage('Regenerated. Copy into gitignored .local/portal-agent.env as PORTAL_AGENT_API_KEY.');
        } catch (regenError: any) {
            setError(regenError?.message || 'Could not regenerate portal agent key.');
        } finally {
            setBusy(false);
        }
    };

    const copy = async () => {
        if (!key) return;
        try {
            await navigator.clipboard.writeText(key);
            setMessage('Copied. Paste into .local/portal-agent.env as PORTAL_AGENT_API_KEY.');
        } catch {
            setError('Clipboard copy failed — select the key and copy manually.');
        }
    };

    return (
        <div className="glass-card p-5 mb-6 space-y-3">
            <div className="flex items-center gap-2 text-plex">
                <KeyRound className="h-4 w-4" />
                <h3 className="text-sm font-black uppercase tracking-[0.2em]">Portal agent key</h3>
            </div>
            <p className="text-sm text-muted">
                Auto-generated and stored encrypted in portal config. Copy it into gitignored
                {' '}<code className="text-xs">.local/portal-agent.env</code> for headless portal access without a
                browser session. No endpoint currently accepts it — the chat route it used to gate was retired.
                Never commit the key.
            </p>
            {key ? (
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <code className="min-w-0 flex-1 break-all rounded-lg border border-border bg-background/80 px-3 py-2 text-xs text-text">
                        {key}
                    </code>
                    <button
                        type="button"
                        onClick={() => void copy()}
                        className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-plex/40 px-3 py-2 text-xs font-bold text-plex hover:bg-plex/10"
                    >
                        <Copy className="h-3.5 w-3.5" />
                        Copy
                    </button>
                </div>
            ) : null}
            <div className="flex flex-wrap gap-2">
                <button
                    type="button"
                    disabled={busy}
                    onClick={() => void reveal()}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-bold text-muted hover:text-text hover:bg-white/5 disabled:opacity-40"
                >
                    <Eye className="h-3.5 w-3.5" />
                    {key ? 'Refresh' : 'Reveal key'}
                </button>
                <button
                    type="button"
                    disabled={busy}
                    onClick={() => void regenerate()}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-bold text-muted hover:text-text hover:bg-white/5 disabled:opacity-40"
                >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Regenerate
                </button>
            </div>
            {message ? <p className="text-xs text-plex">{message}</p> : null}
            {error ? <p className="text-xs text-red-300">{error}</p> : null}
        </div>
    );
};
