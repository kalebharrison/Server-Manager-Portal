export const formatAuditEventName = (event: string) => event
    .split('_')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

export const formatAuditDateTime = (value?: string | null) => {
    if (!value) return 'N/A';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'N/A';
    return date.toLocaleString();
};

export const stringifyAuditValue = (value: any) => {
    if (value === null || value === undefined) return '—';
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    try {
        return JSON.stringify(value);
    } catch {
        return String(value);
    }
};

export const getAuditDiffRows = (details: any) => {
    if (!details || typeof details !== 'object') return [];
    const rows: { field: string; before: string; after: string }[] = [];
    const keys = Object.keys(details);
    const used = new Set<string>();
    const pairCandidate = (primaryKey: string, label: string, candidates: string[]) => {
        if (used.has(primaryKey)) return;
        for (const key of candidates) {
            if (key in details) {
                rows.push({
                    field: label,
                    before: stringifyAuditValue(details[primaryKey]),
                    after: stringifyAuditValue(details[key])
                });
                used.add(primaryKey);
                used.add(key);
                return;
            }
        }
    };

    if ('before' in details && 'after' in details) {
        rows.push({ field: 'Value', before: stringifyAuditValue(details.before), after: stringifyAuditValue(details.after) });
        used.add('before');
        used.add('after');
    }
    if ('oldValue' in details && 'newValue' in details) {
        rows.push({ field: 'Value', before: stringifyAuditValue(details.oldValue), after: stringifyAuditValue(details.newValue) });
        used.add('oldValue');
        used.add('newValue');
    }

    keys.forEach((key) => {
        if (used.has(key)) return;
        if (!key.startsWith('previous')) return;
        const suffix = key.replace(/^previous/, '');
        if (!suffix) return;
        const lowerSuffix = suffix.charAt(0).toLowerCase() + suffix.slice(1);
        pairCandidate(key, suffix, [lowerSuffix, `new${suffix}`, `current${suffix}`]);
    });
    return rows;
};
