import React from 'react';
import { QC_KPI } from './qcUi';

type Props = {
    label: string;
    value: React.ReactNode;
    detail?: React.ReactNode;
    valueClassName?: string;
    onClick?: () => void;
    className?: string;
    children?: React.ReactNode;
};

/** Compact glass status tile used across QC Overview / panels. */
export const QcKpiTile: React.FC<Props> = ({
    label,
    value,
    detail,
    valueClassName = 'text-text',
    onClick,
    className = '',
    children,
}) => {
    const shared = `${QC_KPI} text-left w-full appearance-none ${onClick ? 'hover:border-plex/40 transition-colors cursor-pointer' : ''} ${className}`;

    const body = (
        <>
            <div className="text-[11px] uppercase tracking-wide text-muted">{label}</div>
            <div className={`mt-1 text-lg font-bold ${valueClassName}`}>{value}</div>
            {detail != null ? <p className="mt-1 text-[11px] text-muted">{detail}</p> : null}
            {children}
        </>
    );

    if (onClick) {
        return (
            <button type="button" onClick={onClick} className={shared}>
                {body}
            </button>
        );
    }

    return <div className={shared}>{body}</div>;
};
