import React, { useEffect, useRef, useState } from 'react';
import { Loader2, MessageSquare, Send, Sparkles, Trash2 } from 'lucide-react';

import { apiFetch } from '../shared/api';
import { RequestMediaCard } from './RequestMediaCard';
import type { RequestMediaItem } from './types';

type ChatRole = 'user' | 'assistant';

type ChatMessage = {
    id: string;
    role: ChatRole;
    content: string;
    results?: RequestMediaItem[];
};

type DiscoverChatPanelProps = {
    requestingId: number | null;
    onOpen: (item: RequestMediaItem) => void;
    onRequest: (item: RequestMediaItem) => void;
    onReportIssue: (item: RequestMediaItem) => void;
};

const newId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export const DiscoverChatPanel: React.FC<DiscoverChatPanelProps> = ({
    requestingId,
    onOpen,
    onRequest,
    onReportIssue,
}) => {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [draft, setDraft] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const bottomRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }, [messages, busy]);

    const send = async () => {
        const query = draft.trim();
        if (!query || busy) return;
        const history = messages
            .filter((entry) => entry.role === 'user' || entry.role === 'assistant')
            .map((entry) => ({ role: entry.role, content: entry.content }))
            .slice(-8);
        const userMessage: ChatMessage = { id: newId(), role: 'user', content: query };
        setMessages((prev) => [...prev, userMessage]);
        setDraft('');
        setBusy(true);
        setError('');
        try {
            const data = await apiFetch('/api/request-app/discover-chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query, history }),
                forceRefresh: true,
            });
            const results = (Array.isArray(data?.results) ? data.results : [])
                .filter((item: RequestMediaItem) => item?.tmdbId && item?.mediaType);
            setMessages((prev) => [...prev, {
                id: newId(),
                role: 'assistant',
                content: String(data?.answer || 'No answer.'),
                results,
            }]);
        } catch (sendError: any) {
            setError(sendError?.message || 'Discovery chat failed.');
            setMessages((prev) => [...prev, {
                id: newId(),
                role: 'assistant',
                content: sendError?.message || 'Discovery chat failed. Check Discord LLM settings if this keeps happening.',
            }]);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="glass-card overflow-hidden shadow-xl">
            <div className="flex items-start justify-between gap-3 border-b border-border/70 px-4 py-4 md:px-5">
                <div>
                    <div className="flex items-center gap-2 text-plex mb-1">
                        <Sparkles className="h-4 w-4" />
                        <span className="text-[10px] font-black uppercase tracking-[0.25em]">Ask Requesty</span>
                    </div>
                    <h2 className="text-xl font-black text-text tracking-tight">Media discovery chat</h2>
                    <p className="text-sm text-muted mt-1 max-w-2xl">
                        Describe what you want to watch. Follow up in the same thread — then request titles from the results.
                    </p>
                </div>
                {messages.length > 0 && (
                    <button
                        type="button"
                        onClick={() => { setMessages([]); setError(''); }}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-bold text-muted hover:text-text hover:bg-white/5"
                        title="Clear conversation"
                    >
                        <Trash2 className="h-3.5 w-3.5" />
                        Clear
                    </button>
                )}
            </div>

            <div className="flex min-h-[28rem] flex-col">
                <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 md:px-5 max-h-[60vh]">
                    {messages.length === 0 && !busy && (
                        <div className="rounded-xl border border-dashed border-border/80 bg-background/40 px-4 py-8 text-center">
                            <MessageSquare className="mx-auto h-8 w-8 text-muted mb-3" />
                            <p className="text-sm font-bold text-text">Try something like</p>
                            <p className="text-sm text-muted mt-2">
                                “zombie movie set in a casino” · “latest Brad Pitt movies” · “what about Remains 2011?”
                            </p>
                        </div>
                    )}

                    {messages.map((message) => (
                        <div key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-3xl space-y-3 ${message.role === 'user' ? 'items-end' : 'items-start'}`}>
                                <div className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                                    message.role === 'user'
                                        ? 'bg-plex text-background font-semibold'
                                        : 'bg-background/70 border border-border text-text'
                                }`}>
                                    {message.content}
                                </div>
                                {message.role === 'assistant' && message.results?.length ? (
                                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                                        {message.results.map((item, index) => (
                                            <RequestMediaCard
                                                key={`${item.mediaType}-${item.tmdbId}`}
                                                item={item}
                                                busy={requestingId === item.tmdbId}
                                                priority={index < 2}
                                                onOpen={onOpen}
                                                onRequest={onRequest}
                                                onReportIssue={onReportIssue}
                                            />
                                        ))}
                                    </div>
                                ) : null}
                            </div>
                        </div>
                    ))}

                    {busy && (
                        <div className="flex items-center gap-2 text-sm text-muted">
                            <Loader2 className="h-4 w-4 animate-spin text-plex" />
                            Searching and checking the library…
                        </div>
                    )}
                    <div ref={bottomRef} />
                </div>

                <div className="border-t border-border/70 px-4 py-3 md:px-5">
                    <div className="flex gap-2">
                        <input
                            value={draft}
                            onChange={(event) => setDraft(event.target.value)}
                            onKeyDown={(event) => {
                                if (event.key === 'Enter' && !event.shiftKey) {
                                    event.preventDefault();
                                    void send();
                                }
                            }}
                            maxLength={800}
                            disabled={busy}
                            placeholder="Ask about a movie or show…"
                            className="min-w-0 flex-1 h-12 rounded-xl border border-border bg-background/80 px-4 text-sm text-text outline-none focus:border-plex focus:ring-1 focus:ring-plex disabled:opacity-60"
                        />
                        <button
                            type="button"
                            title="Send"
                            disabled={busy || draft.trim().length < 2}
                            onClick={() => void send()}
                            className="inline-flex h-12 w-12 items-center justify-center rounded-xl border border-plex/40 text-plex hover:bg-plex/10 disabled:opacity-40"
                        >
                            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                        </button>
                    </div>
                    {error ? <p className="mt-2 text-xs text-red-300">{error}</p> : null}
                </div>
            </div>
        </div>
    );
};
