import React, { useState } from 'react';
import { MessageSquare, Send } from 'lucide-react';

import { apiFetch } from '../shared/api';

const formatDate = (value: string | null) => {
    if (!value) return '';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : date.toLocaleString();
};

export const IssueConversation: React.FC<{
    issueId: string;
    count: number;
    canComment: boolean;
}> = ({ issueId, count, canComment }) => {
    const [open, setOpen] = useState(false);
    const [comments, setComments] = useState<any[] | null>(null);
    const [message, setMessage] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const load = async () => {
        setError('');
        try {
            const data = await apiFetch(`/api/media-issues/${encodeURIComponent(issueId)}/comments`, { forceRefresh: true });
            setComments(data.comments || []);
        } catch (loadError: any) {
            setError(loadError?.message || 'Conversation could not be loaded.');
        }
    };

    const toggle = async () => {
        const next = !open;
        setOpen(next);
        if (next && comments === null) await load();
    };

    const send = async () => {
        if (message.trim().length < 2) return;
        setBusy(true);
        setError('');
        try {
            await apiFetch(`/api/media-issues/${encodeURIComponent(issueId)}/comments`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message }),
            });
            setMessage('');
            await load();
        } catch (sendError: any) {
            setError(sendError?.message || 'Reply could not be sent.');
        } finally {
            setBusy(false);
        }
    };

    return <div className="basis-full border-t border-border/70 pt-3">
        <button type="button" onClick={toggle} className="flex items-center gap-2 text-xs font-bold text-muted hover:text-text">
            <MessageSquare className="h-4 w-4" /> Conversation{count > 0 ? ` (${count})` : ''}
        </button>
        {open && <div className="mt-3 space-y-3">
            {comments?.map((comment) => <div key={comment.id} className="rounded-lg bg-background/60 px-3 py-2">
                <p className="text-sm text-text/90">{comment.message}</p>
                <p className="mt-1 text-[11px] text-muted">{comment.author ? `${comment.author} · ` : ''}{formatDate(comment.createdAt)}</p>
            </div>)}
            {comments?.length === 0 && <p className="text-xs text-muted">No replies yet.</p>}
            {canComment && <div className="flex gap-2"><input value={message} onChange={(event) => setMessage(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void send(); }} maxLength={2000} placeholder="Write a reply" className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-text" /><button type="button" title="Send reply" disabled={busy || message.trim().length < 2} onClick={send} className="rounded-lg border border-plex/40 px-3 text-plex disabled:opacity-40"><Send className="h-4 w-4" /></button></div>}
            {error && <p className="text-xs text-red-300">{error}</p>}
        </div>}
    </div>;
};
