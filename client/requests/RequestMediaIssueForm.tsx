import React, { useState } from 'react';
import { AlertTriangle, Clock3 } from 'lucide-react';

import { apiFetch } from '../shared/api';
import { DetailSection } from './RequestMediaDetails';
import type { RequestMediaItem } from './types';

const issueOptions = [
    { id: 'video', label: 'Video' },
    { id: 'audio', label: 'Audio' },
    { id: 'subtitles', label: 'Subtitles' },
    { id: 'other', label: 'Other' },
] as const;

export const RequestMediaIssueForm: React.FC<{
    item: RequestMediaItem;
    onCancel: () => void;
}> = ({ item, onCancel }) => {
    const [issueType, setIssueType] = useState<(typeof issueOptions)[number]['id']>('video');
    const [issueMessage, setIssueMessage] = useState('');
    const [issueStatus, setIssueStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
    const [issueError, setIssueError] = useState('');

    const submitIssue = async () => {
        const message = issueMessage.trim();
        if (!message) return;
        setIssueStatus('submitting');
        setIssueError('');
        try {
            await apiFetch(`/api/request-app/media/${item.mediaType}/${item.tmdbId}/issue`, {
                method: 'POST',
                body: JSON.stringify({
                    title: item.title,
                    issueType,
                    message,
                }),
            });
            setIssueStatus('success');
            setIssueMessage('');
        } catch (err: any) {
            setIssueStatus('error');
            setIssueError(err?.message || 'Failed to report issue');
        }
    };

    return (
        <DetailSection title="Report Issue" className="mt-7">
            <div className="rounded-xl border border-white/10 bg-background/35 p-4">
                <div className="mb-3 flex flex-wrap gap-2">
                    {issueOptions.map((option) => (
                        <button
                            key={option.id}
                            type="button"
                            onClick={() => setIssueType(option.id)}
                            className={`rounded-lg border px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition-colors ${issueType === option.id ? 'border-plex bg-plex text-background' : 'border-border text-muted hover:text-text hover:bg-white/5'}`}
                        >
                            {option.label}
                        </button>
                    ))}
                </div>
                <textarea
                    value={issueMessage}
                    onChange={(event) => {
                        setIssueMessage(event.target.value);
                        setIssueStatus('idle');
                        setIssueError('');
                    }}
                    placeholder="Describe what is wrong."
                    className="h-28 w-full resize-none rounded-xl border border-border bg-card p-3 text-sm text-text outline-none transition-colors focus:border-plex"
                />
                {issueStatus === 'success' ? (
                    <p className="mt-2 text-sm font-semibold text-green-300">Issue submitted.</p>
                ) : issueStatus === 'error' ? (
                    <p className="mt-2 text-sm font-semibold text-red-300">{issueError}</p>
                ) : null}
                <div className="mt-3 flex justify-end gap-2">
                    <button
                        type="button"
                        onClick={onCancel}
                        className="rounded-lg border border-border px-3 py-2 text-sm text-muted transition-colors hover:bg-white/5 hover:text-text"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        disabled={issueStatus === 'submitting' || !issueMessage.trim()}
                        onClick={submitIssue}
                        className="inline-flex items-center justify-center gap-2 rounded-lg bg-plex px-3 py-2 text-sm font-bold text-background transition-colors hover:bg-plex-hover disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {issueStatus === 'submitting' ? <Clock3 className="h-4 w-4 animate-pulse" /> : <AlertTriangle className="h-4 w-4" />}
                        Submit Issue
                    </button>
                </div>
            </div>
        </DetailSection>
    );
};
