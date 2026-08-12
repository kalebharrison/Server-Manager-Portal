import React, { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../shared/api';

type IntegrityCheck = 'playability' | 'trim' | 'imohash' | 'xxhash';
type IntegritySchedule = 'import' | 'nightly';

export type IntegritySchedulePolicy = Record<string, {
    import?: Partial<Record<IntegrityCheck, boolean>>;
    nightly?: Partial<Record<IntegrityCheck, boolean>>;
}>;

type LibraryRow = {
    key: string;
    label: string;
    mediaType?: string | null;
};

const CHECKS: Array<{ key: IntegrityCheck; label: string; videoOnly?: boolean; xxhashOnly?: boolean }> = [
    { key: 'playability', label: 'Playback' },
    { key: 'trim', label: 'Trim', videoOnly: true },
    { key: 'imohash', label: 'Fingerprint' },
    { key: 'xxhash', label: 'Hash', xxhashOnly: true },
];

const SCHEDULES: Array<{ key: IntegritySchedule; label: string }> = [
    { key: 'import', label: 'New / 24h' },
    { key: 'nightly', label: 'Nightly' },
];

const isAllowed = (
    policy: IntegritySchedulePolicy,
    libraryKey: string,
    schedule: IntegritySchedule,
    check: IntegrityCheck,
) => policy?.[libraryKey]?.[schedule]?.[check] !== false;

type Props = {
    enabled: boolean;
    integrityEnabled: boolean;
    integrityXxhashEnabled: boolean;
    policy: IntegritySchedulePolicy;
    onChange: (next: IntegritySchedulePolicy) => void;
};

export const IntegritySchedulePolicyCard: React.FC<Props> = ({
    enabled,
    integrityEnabled,
    integrityXxhashEnabled,
    policy,
    onChange,
}) => {
    const [libraries, setLibraries] = useState<LibraryRow[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!enabled || !integrityEnabled) return;
        let cancelled = false;
        setLoading(true);
        void apiFetch('/api/upgrader/qc/integrity')
            .then((status: any) => {
                if (cancelled) return;
                const rows = Array.isArray(status?.coverage?.byLibrary)
                    ? status.coverage.byLibrary
                        .map((lib: any) => ({
                            key: String(lib?.key || '').trim(),
                            label: String(lib?.label || lib?.key || '').trim(),
                            mediaType: lib?.mediaType || null,
                        }))
                        .filter((lib: LibraryRow) => lib.key)
                    : [];
                const known = new Map<string, LibraryRow>(rows.map((lib: LibraryRow) => [lib.key, lib]));
                for (const key of Object.keys(policy || {})) {
                    if (!known.has(key)) {
                        known.set(key, { key, label: key, mediaType: null });
                    }
                }
                setLibraries([...known.values()].sort((a, b) => a.label.localeCompare(b.label)));
            })
            .catch(() => {
                if (!cancelled) {
                    setLibraries(
                        Object.keys(policy || {})
                            .map((key) => ({ key, label: key, mediaType: null }))
                            .sort((a, b) => a.label.localeCompare(b.label)),
                    );
                }
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => { cancelled = true; };
    }, [enabled, integrityEnabled]); // eslint-disable-line react-hooks/exhaustive-deps -- refresh on open, not every policy keystroke

    const visibleChecks = useMemo(
        () => CHECKS.filter((check) => !check.xxhashOnly || integrityXxhashEnabled),
        [integrityXxhashEnabled],
    );

    const checkColCount = visibleChecks.length;
    const scheduleColCount = SCHEDULES.length * checkColCount;

    const setCell = (
        libraryKey: string,
        schedule: IntegritySchedule,
        check: IntegrityCheck,
        next: boolean,
    ) => {
        const prevLib = policy?.[libraryKey] || {};
        const prevSchedule = prevLib[schedule] || {};
        onChange({
            ...policy,
            [libraryKey]: {
                ...prevLib,
                [schedule]: {
                    ...prevSchedule,
                    [check]: next,
                },
            },
        });
    };

    return (
        <div className="rounded-xl border border-border/60 bg-white/[0.02] p-5 space-y-3">
            <div>
                <h4 className="text-sm font-bold uppercase tracking-wide text-muted">Schedule policy</h4>
                <p className="text-[11px] text-muted mt-1 max-w-3xl leading-snug">
                    Per-library toggles for time-gated Integrity. New/24h covers Arr webhooks and the recent-import catch-up.
                    Nightly covers the scheduled library passes. Manual Integrity buttons always run. Missing cells default to on.
                    The Trim column is the keep-rule check running, not a remux — remux still depends on Settings' remux tier.
                </p>
            </div>
            {loading && libraries.length === 0 && (
                <p className="text-xs text-muted">Loading libraries from Integrity coverage…</p>
            )}
            {!loading && libraries.length === 0 && (
                <p className="text-xs text-muted">
                    Coverage loads after the Integrity index is ready. Until then, every library/check defaults to allowed.
                </p>
            )}
            {libraries.length > 0 && (
                <div className="overflow-x-auto">
                    <table className="w-full table-fixed text-[11px] border-collapse">
                        <colgroup>
                            <col className="w-[9.5rem]" />
                            {Array.from({ length: scheduleColCount }, (_, index) => (
                                <col key={`col-${index}`} className="w-[4.25rem]" />
                            ))}
                        </colgroup>
                        <thead>
                            <tr className="text-muted">
                                <th className="py-1.5 pr-2 text-left font-semibold">Library</th>
                                {SCHEDULES.map((schedule, scheduleIndex) => (
                                    <th
                                        key={schedule.key}
                                        className={[
                                            'py-1.5 font-semibold text-center',
                                            scheduleIndex > 0 ? 'border-l border-border/50' : '',
                                        ].join(' ')}
                                        colSpan={checkColCount}
                                    >
                                        {schedule.label}
                                    </th>
                                ))}
                            </tr>
                            <tr className="text-muted/80">
                                <th className="py-1 pr-2" />
                                {SCHEDULES.map((schedule, scheduleIndex) => (
                                    <React.Fragment key={`${schedule.key}-hdr`}>
                                        {visibleChecks.map((check, checkIndex) => (
                                            <th
                                                key={`${schedule.key}-${check.key}`}
                                                className={[
                                                    'py-1 px-0.5 font-medium text-center whitespace-nowrap',
                                                    scheduleIndex > 0 && checkIndex === 0 ? 'border-l border-border/50' : '',
                                                ].join(' ')}
                                            >
                                                {check.label}
                                            </th>
                                        ))}
                                    </React.Fragment>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {libraries.map((lib) => (
                                <tr key={lib.key} className="border-t border-border/40">
                                    <td className="py-2 pr-2 font-semibold text-text whitespace-nowrap truncate" title={lib.label}>
                                        {lib.label}
                                    </td>
                                    {SCHEDULES.map((schedule, scheduleIndex) => (
                                        <React.Fragment key={`${lib.key}-${schedule.key}`}>
                                            {visibleChecks.map((check, checkIndex) => {
                                                const notApplicable = check.videoOnly && lib.mediaType === 'album';
                                                return (
                                                    <td
                                                        key={`${lib.key}-${schedule.key}-${check.key}`}
                                                        className={[
                                                            'py-2 px-0.5 text-center align-middle',
                                                            scheduleIndex > 0 && checkIndex === 0 ? 'border-l border-border/50' : '',
                                                        ].join(' ')}
                                                    >
                                                        {notApplicable ? (
                                                            <span className="text-muted">—</span>
                                                        ) : (
                                                            <input
                                                                type="checkbox"
                                                                className="h-3.5 w-3.5 accent-plex align-middle"
                                                                disabled={!enabled || !integrityEnabled}
                                                                checked={isAllowed(policy, lib.key, schedule.key, check.key)}
                                                                onChange={(event) => setCell(
                                                                    lib.key,
                                                                    schedule.key,
                                                                    check.key,
                                                                    event.target.checked,
                                                                )}
                                                                title={`${lib.label} · ${schedule.label} · ${check.label}`}
                                                            />
                                                        )}
                                                    </td>
                                                );
                                            })}
                                        </React.Fragment>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};
