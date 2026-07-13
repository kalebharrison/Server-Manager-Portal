import React from 'react';
import { UserRound } from 'lucide-react';

import type { RequestCredit, RequestMediaItem, RequestNamedValue } from './types';

export const formatDate = (value?: string | null) => {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
};

export const formatRuntime = (minutes?: number | null) => {
    if (!minutes) return null;
    const hours = Math.floor(minutes / 60);
    const remaining = minutes % 60;
    return hours ? `${hours}h ${remaining}m` : `${remaining}m`;
};

export const formatMoney = (value?: number | null) => {
    if (!value) return null;
    return new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: 'USD',
        notation: 'compact',
        maximumFractionDigits: 1,
    }).format(value);
};

export const formatLanguage = (value?: string | null) => {
    if (!value) return null;
    try {
        const DisplayNames = (Intl as any).DisplayNames;
        const formatter = DisplayNames ? new DisplayNames(undefined, { type: 'language' }) : null;
        return formatter?.of(value) || value.toUpperCase();
    } catch {
        return value.toUpperCase();
    }
};

export const requestStateLabel = (item: RequestMediaItem) => {
    if (item.available) return 'Available';
    if (item.processing) return 'Processing';
    if (item.requested || item.pending || item.approved) return 'Requested';
    return 'Request';
};

const initials = (name: string) => name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');

export const DetailPill: React.FC<{ children: React.ReactNode; tone?: 'default' | 'good' | 'warn' }> = ({ children, tone = 'default' }) => {
    const toneClass = tone === 'good'
        ? 'border-green-500/30 bg-green-500/15 text-green-100'
        : tone === 'warn'
            ? 'border-amber-500/30 bg-amber-500/15 text-amber-100'
            : 'border-white/10 bg-white/10 text-white/80';

    return <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold ${toneClass}`}>{children}</span>;
};

export const DetailSection: React.FC<{ title: string; children: React.ReactNode; className?: string }> = ({ title, children, className = '' }) => (
    <section className={className}>
        <h3 className="mb-3 text-sm font-black uppercase tracking-[0.18em] text-muted">{title}</h3>
        {children}
    </section>
);

export const CreditStrip: React.FC<{ title: string; credits?: RequestCredit[] }> = ({ title, credits = [] }) => {
    if (!credits.length) return null;
    return (
        <DetailSection title={title}>
            <div className="flex gap-3 overflow-x-auto custom-scrollbar pb-2">
                {credits.map((credit) => (
                    <div key={`${credit.id || credit.name}-${credit.role || ''}`} className="w-28 shrink-0">
                        <div className="aspect-[2/3] overflow-hidden rounded-xl border border-white/10 bg-background/70">
                            {credit.profileUrl ? (
                                <img src={credit.profileUrl} alt={credit.name} className="h-full w-full object-cover" loading="lazy" decoding="async" />
                            ) : (
                                <div className="flex h-full w-full items-center justify-center text-lg font-black text-muted">
                                    {initials(credit.name) || <UserRound className="h-7 w-7" />}
                                </div>
                            )}
                        </div>
                        <p className="mt-2 text-xs font-bold text-text line-clamp-2">{credit.name}</p>
                        {credit.role ? <p className="text-[11px] text-muted line-clamp-2">{credit.role}</p> : null}
                    </div>
                ))}
            </div>
        </DetailSection>
    );
};

export const NamedValueGrid: React.FC<{ title: string; items?: RequestNamedValue[] }> = ({ title, items = [] }) => {
    if (!items.length) return null;
    return (
        <DetailSection title={title}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {items.map((item) => (
                    <div key={`${item.id || item.name}`} className="flex items-center gap-3 rounded-xl border border-white/10 bg-background/35 p-3">
                        {item.logoUrl ? (
                            <img src={item.logoUrl} alt="" className="h-8 w-12 rounded bg-white/90 object-contain p-1" loading="lazy" decoding="async" />
                        ) : (
                            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-xs font-black text-muted">{initials(item.name)}</div>
                        )}
                        <span className="min-w-0 text-sm font-semibold text-text line-clamp-2">{item.name}</span>
                    </div>
                ))}
            </div>
        </DetailSection>
    );
};
