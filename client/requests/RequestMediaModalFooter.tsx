import React from 'react';
import { AlertTriangle, Check, Clock3, ExternalLink } from 'lucide-react';

import { requestStateLabel } from './RequestMediaDetails';
import type { RequestMediaItem } from './types';

export const RequestMediaModalFooter: React.FC<{
    detail: RequestMediaItem;
    saving: boolean;
    selectedSeasonCount: number;
    onClose: () => void;
    onSubmit: () => void;
    onToggleIssueForm: () => void;
}> = ({ detail, saving, selectedSeasonCount, onClose, onSubmit, onToggleIssueForm }) => {
    const canRequest = detail.canRequest !== false;
    const canSubmit = !saving && canRequest && (detail.mediaType !== 'tv' || selectedSeasonCount > 0);
    const canReportIssue = !!(detail.mediaId || detail.ratingKey);
    const requestLabel = requestStateLabel(detail);

    return (
        <div className="flex flex-col gap-3 border-t border-white/10 p-4 md:flex-row md:items-center md:justify-between md:p-5">
            <div className="text-xs text-muted">
                {canRequest
                    ? (detail.mediaType === 'tv' ? 'Select seasons, then request.' : 'Submits to your configured request app.')
                    : `${detail.title} is marked ${requestLabel.toLowerCase()}.`}
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                {detail.plexUrl ? (
                    <a href={detail.plexUrl} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 rounded-lg border border-green-500/30 bg-green-500/15 px-4 py-2 font-bold text-green-100 transition-colors hover:bg-green-500/25">
                        <ExternalLink className="h-4 w-4" /> Open in Plex
                    </a>
                ) : null}
                {canReportIssue ? (
                    <button
                        type="button"
                        onClick={onToggleIssueForm}
                        className="inline-flex items-center justify-center gap-2 rounded-lg border border-amber-500/30 px-4 py-2 font-bold text-amber-100 transition-colors hover:bg-amber-500/10"
                    >
                        <AlertTriangle className="h-4 w-4" />
                        Report Issue
                    </button>
                ) : null}
                <button type="button" onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-muted transition-colors hover:bg-white/5 hover:text-text">
                    Close
                </button>
                <button
                    type="button"
                    disabled={!canSubmit}
                    onClick={onSubmit}
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-plex px-4 py-2 font-bold text-background transition-colors hover:bg-plex-hover disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {saving ? <Clock3 className="h-4 w-4 animate-pulse" /> : <Check className="h-4 w-4" />}
                    {canRequest ? 'Request' : requestLabel}
                </button>
            </div>
        </div>
    );
};
