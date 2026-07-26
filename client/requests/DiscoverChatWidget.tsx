import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, MessageSquare, Minimize2, Send, Sparkles, Trash2, X } from 'lucide-react';

import { apiFetch } from '../shared/api';
import { pushToast, ToastContainer, type ToastMessage } from '../shared/toast';
import { RequestMediaCard } from './RequestMediaCard';
import { RequestMediaModal } from './RequestMediaModal';
import type { RequestMediaItem } from './types';

type ChatRole = 'user' | 'assistant';

type ChatMessage = {
    id: string;
    role: ChatRole;
    content: string;
    results?: RequestMediaItem[];
};

const STORAGE_KEY = 'portal-discover-chat-v1';
const newId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

type StoredChat = {
    open?: boolean;
    messages?: ChatMessage[];
};

const loadStored = (): StoredChat => {
    try {
        const raw = sessionStorage.getItem(STORAGE_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        return {};
    }
};

const consumeAskQuery = (): string => {
    if (typeof window === 'undefined') return '';
    try {
        const url = new URL(window.location.href);
        const ask = String(url.searchParams.get('ask') || '').trim();
        if (!ask) return '';
        url.searchParams.delete('ask');
        const next = `${url.pathname}${url.search}${url.hash}`;
        window.history.replaceState({}, '', next);
        return ask.slice(0, 800);
    } catch {
        return '';
    }
};

type DiscoverChatWidgetProps = {
    /** When false, hide the widget (e.g. request app not in nav). */
    enabled?: boolean;
    readOnly?: boolean;
};

export const DiscoverChatWidget: React.FC<DiscoverChatWidgetProps> = ({
    enabled = true,
    readOnly = false,
}) => {
    const stored = useRef(loadStored()).current;
    const [visible, setVisible] = useState(false);
    const [open, setOpen] = useState(() => stored.open === true);
    const [messages, setMessages] = useState<ChatMessage[]>(() => (
        Array.isArray(stored.messages) ? stored.messages : []
    ));
    const [draft, setDraft] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [toasts, setToasts] = useState<ToastMessage[]>([]);
    const [requestingId, setRequestingId] = useState<number | null>(null);
    const [selectedItem, setSelectedItem] = useState<RequestMediaItem | null>(null);
    const [openIssueOnSelect, setOpenIssueOnSelect] = useState(false);
    const bottomRef = useRef<HTMLDivElement | null>(null);
    const inputRef = useRef<HTMLInputElement | null>(null);
    const askConsumed = useRef(false);

    useEffect(() => {
        if (!enabled) {
            setVisible(false);
            return;
        }
        let cancelled = false;
        apiFetch('/api/request-app/status', { cacheTtlMs: 15_000 })
            .then((data) => {
                if (!cancelled) setVisible(data?.ready === true);
            })
            .catch(() => {
                if (!cancelled) setVisible(false);
            });
        return () => { cancelled = true; };
    }, [enabled]);

    useEffect(() => {
        if (!visible) return;
        try {
            sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
                open,
                messages: messages.slice(-24),
            }));
        } catch {
            /* ignore quota */
        }
    }, [visible, open, messages]);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }, [messages, busy, open]);

    useEffect(() => {
        if (!visible || askConsumed.current) return;
        const ask = consumeAskQuery();
        if (!ask) return;
        askConsumed.current = true;
        setOpen(true);
        setDraft(ask);
    }, [visible]);

    useEffect(() => {
        if (open) {
            const timer = window.setTimeout(() => inputRef.current?.focus(), 50);
            return () => window.clearTimeout(timer);
        }
        return undefined;
    }, [open]);

    const addToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
        setToasts((prev) => pushToast(prev, message, type));
    }, []);

    const send = useCallback(async (override?: string) => {
        const query = String(override ?? draft).trim();
        if (!query || busy || readOnly) return;
        const history = messages
            .filter((entry) => entry.role === 'user' || entry.role === 'assistant')
            .map((entry) => ({ role: entry.role, content: entry.content }))
            .slice(-8);
        const userMessage: ChatMessage = { id: newId(), role: 'user', content: query };
        setMessages((prev) => [...prev, userMessage]);
        setDraft('');
        setBusy(true);
        setError('');
        setOpen(true);
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
    }, [busy, draft, messages, readOnly]);

    const openDetails = useCallback((item: RequestMediaItem) => {
        setOpenIssueOnSelect(false);
        if (!item.tmdbId && item.plexUrl) window.open(item.plexUrl, '_blank', 'noopener,noreferrer');
        else setSelectedItem(item);
    }, []);

    const openIssue = useCallback((item: RequestMediaItem) => {
        setOpenIssueOnSelect(true);
        setSelectedItem(item);
    }, []);

    const submitRequest = useCallback(async (item: RequestMediaItem, seasons: number[] | 'all' = []) => {
        if (readOnly || item.canRequest === false) return;
        setRequestingId(item.tmdbId);
        try {
            await apiFetch(`/api/request-app/media/${item.mediaType}/${item.tmdbId}/request`, {
                method: 'POST',
                body: JSON.stringify({ title: item.title, seasons }),
            });
            setSelectedItem(null);
            addToast(
                item.mediaType === 'tv' && seasons === 'all'
                    ? `Requested "${item.title}" (all seasons)`
                    : `Requested "${item.title}"`,
            );
            setMessages((prev) => prev.map((message) => ({
                ...message,
                results: message.results?.map((entry) => (
                    entry.tmdbId === item.tmdbId && entry.mediaType === item.mediaType
                        ? { ...entry, requested: true, pending: false, canRequest: false, requestStatusLabel: 'requested' }
                        : entry
                )),
            })));
        } catch (err: any) {
            addToast(err?.message || 'Failed to submit request', 'error');
        } finally {
            setRequestingId(null);
        }
    }, [addToast, readOnly]);

    const requestFromCard = useCallback((item: RequestMediaItem) => {
        if (readOnly || item.canRequest === false) return;
        void submitRequest(item, item.mediaType === 'tv' ? 'all' : []);
    }, [readOnly, submitRequest]);

    if (!enabled || !visible) return null;

    return (
        <>
            <ToastContainer toasts={toasts} setToasts={setToasts} />

            {!open && (
                <button
                    type="button"
                    onClick={() => setOpen(true)}
                    className="fixed z-[1900] bottom-20 right-4 md:bottom-6 md:right-6 inline-flex h-14 w-14 items-center justify-center rounded-full border border-plex/50 bg-plex text-background shadow-2xl shadow-plex/30 hover:bg-plex-hover transition-transform hover:scale-105"
                    title="Ask Requesty"
                    aria-label="Open Ask Requesty chat"
                >
                    <MessageSquare className="h-6 w-6" />
                </button>
            )}

            {open && (
                <div
                    className="fixed z-[1900] bottom-20 right-3 left-3 sm:left-auto sm:right-6 sm:bottom-6 sm:w-[24rem] md:w-[26rem] flex flex-col overflow-hidden rounded-2xl border border-border/80 bg-card/95 backdrop-blur-xl shadow-2xl"
                    style={{ maxHeight: 'min(70vh, 36rem)' }}
                    role="dialog"
                    aria-label="Ask Requesty"
                >
                    <div className="flex items-center justify-between gap-2 border-b border-border/70 px-3 py-2.5">
                        <div className="min-w-0 flex items-center gap-2 text-plex">
                            <Sparkles className="h-4 w-4 shrink-0" />
                            <div className="min-w-0">
                                <p className="text-[10px] font-black uppercase tracking-[0.2em]">Ask Requesty</p>
                                <p className="truncate text-xs text-muted">Movies & TV discovery</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-1">
                            {messages.length > 0 && (
                                <button
                                    type="button"
                                    onClick={() => { setMessages([]); setError(''); }}
                                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:text-text hover:bg-white/5"
                                    title="Clear conversation"
                                >
                                    <Trash2 className="h-3.5 w-3.5" />
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={() => setOpen(false)}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:text-text hover:bg-white/5"
                                title="Minimize"
                            >
                                <Minimize2 className="h-3.5 w-3.5" />
                            </button>
                            <button
                                type="button"
                                onClick={() => setOpen(false)}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:text-text hover:bg-white/5 sm:hidden"
                                title="Close"
                            >
                                <X className="h-3.5 w-3.5" />
                            </button>
                        </div>
                    </div>

                    <div className="flex-1 min-h-0 space-y-3 overflow-y-auto px-3 py-3">
                        {messages.length === 0 && !busy && (
                            <div className="rounded-xl border border-dashed border-border/80 bg-background/40 px-3 py-6 text-center">
                                <MessageSquare className="mx-auto h-7 w-7 text-muted mb-2" />
                                <p className="text-xs font-bold text-text">Try something like</p>
                                <p className="text-xs text-muted mt-1.5 leading-relaxed">
                                    “zombie movie set in a casino” · “kid who sees dead people”
                                </p>
                            </div>
                        )}

                        {messages.map((message) => (
                            <div key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-full space-y-2 ${message.role === 'user' ? 'items-end' : 'items-start'}`}>
                                    <div className={`rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                                        message.role === 'user'
                                            ? 'bg-plex text-background font-semibold'
                                            : 'bg-background/70 border border-border text-text'
                                    }`}>
                                        {message.content}
                                    </div>
                                    {message.role === 'assistant' && message.results?.length ? (
                                        <div className="grid grid-cols-2 gap-2">
                                            {message.results.map((item, index) => (
                                                <RequestMediaCard
                                                    key={`${item.mediaType}-${item.tmdbId}`}
                                                    item={item}
                                                    busy={requestingId === item.tmdbId}
                                                    priority={index < 2}
                                                    onOpen={openDetails}
                                                    onRequest={requestFromCard}
                                                    onReportIssue={openIssue}
                                                />
                                            ))}
                                        </div>
                                    ) : null}
                                </div>
                            </div>
                        ))}

                        {busy && (
                            <div className="flex items-center gap-2 text-xs text-muted">
                                <Loader2 className="h-3.5 w-3.5 animate-spin text-plex" />
                                Searching and checking the library…
                            </div>
                        )}
                        <div ref={bottomRef} />
                    </div>

                    <div className="border-t border-border/70 px-3 py-2.5">
                        <div className="flex gap-2">
                            <input
                                ref={inputRef}
                                value={draft}
                                onChange={(event) => setDraft(event.target.value)}
                                onKeyDown={(event) => {
                                    if (event.key === 'Enter' && !event.shiftKey) {
                                        event.preventDefault();
                                        void send();
                                    }
                                }}
                                maxLength={800}
                                disabled={busy || readOnly}
                                placeholder={readOnly ? 'Requests disabled while viewing as user' : 'Ask about a movie or show…'}
                                className="min-w-0 flex-1 h-11 rounded-xl border border-border bg-background/80 px-3 text-sm text-text outline-none focus:border-plex focus:ring-1 focus:ring-plex disabled:opacity-60"
                            />
                            <button
                                type="button"
                                title="Send"
                                disabled={busy || readOnly || draft.trim().length < 2}
                                onClick={() => void send()}
                                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-plex/40 text-plex hover:bg-plex/10 disabled:opacity-40"
                            >
                                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                            </button>
                        </div>
                        {error ? <p className="mt-1.5 text-[11px] text-red-300">{error}</p> : null}
                    </div>
                </div>
            )}

            {selectedItem && (
                <RequestMediaModal
                    item={selectedItem}
                    saving={requestingId === selectedItem.tmdbId}
                    onClose={() => { setSelectedItem(null); setOpenIssueOnSelect(false); }}
                    onSubmit={submitRequest}
                    initialIssueForm={openIssueOnSelect}
                />
            )}
        </>
    );
};
