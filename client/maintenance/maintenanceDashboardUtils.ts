export const ELIGIBLE_NOW_KEY = 'eligible-now';

export const formatReclaimSizeFromGB = (sizeGB: number) => {
    const safeGB = Math.max(0, Number(sizeGB || 0));
    if (safeGB >= 1024) {
        return `${Math.ceil(safeGB / 1024)} TB`;
    }
    if (safeGB >= 1) {
        return `${Math.ceil(safeGB)} GB`;
    }
    return `${Math.ceil(safeGB * 1024)} MB`;
};

export const getEligibilityTooltip = (item: any) => {
    const daysUntilEligible = Math.max(0, Number(item?.daysUntilEligible || 0));
    const watchDays = Number(item?.daysSinceLastWatch);
    const addedDays = Number(item?.daysSinceAdded);
    const base = daysUntilEligible > 0
        ? `Not eligible yet. Rule grace has ${daysUntilEligible} day(s) remaining.`
        : 'Eligible now for this rule.';
    if (Number.isFinite(watchDays) && watchDays >= 0) {
        return `${base} Last watched ${watchDays} day(s) ago.`;
    }
    if (Number.isFinite(addedDays) && addedDays >= 0) {
        return `${base} Added ${addedDays} day(s) ago.`;
    }
    return base;
};

export const buildCalendarEligibility = (filteredCandidates: any[], selectedCandidateRule: any) => {
    const graceDays = Math.max(0, Number(selectedCandidateRule?.graceDays || 0));
    const createdAtMs = Date.parse(String(selectedCandidateRule?.createdAt || ''));
    const hasRuleCreatedAt = Number.isFinite(createdAtMs);
    const daysSinceRuleCreated = hasRuleCreatedAt
        ? Math.max(0, Math.floor((Date.now() - createdAtMs) / (24 * 60 * 60 * 1000)))
        : graceDays;
    const daysUntilEligible = Math.max(0, graceDays - daysSinceRuleCreated);
    const nowItems: any[] = [];
    const byDay = new Map<string, any[]>();
    filteredCandidates.forEach((item: any) => {
        if (daysUntilEligible <= 0) {
            nowItems.push({ ...item, daysUntilEligible: 0, eligibleDate: null });
            return;
        }
        const etaDate = new Date(Date.now() + (daysUntilEligible * 24 * 60 * 60 * 1000));
        const dateKey = etaDate.toISOString().split('T')[0];
        const enriched = { ...item, daysUntilEligible, eligibleDate: dateKey };
        if (!byDay.has(dateKey)) byDay.set(dateKey, []);
        byDay.get(dateKey)?.push(enriched);
    });
    const laterByDay = Array.from(byDay.entries())
        .sort((a, b) => (a[0] < b[0] ? -1 : 1))
        .map(([date, items]) => ({
            date,
            items,
            count: items.length,
            reclaimGB: items.reduce((sum: number, item: any) => sum + Number(item.sizeGB || 0), 0),
            preview: items.slice(0, 4),
            minDaysUntil: Math.min(...items.map((item: any) => Number(item.daysUntilEligible || 0)))
        }));
    return {
        graceDays,
        daysSinceRuleCreated,
        daysUntilEligible,
        eligibleNow: nowItems.sort((a, b) => String(a.title || '').localeCompare(String(b.title || ''))),
        eligibleLaterByDay: laterByDay
    };
};

export const getSelectedCalendarGroup = (selectedCalendarDate: string | null, calendarEligibility: any) => {
    if (!selectedCalendarDate) return null;
    if (selectedCalendarDate === ELIGIBLE_NOW_KEY) {
        const items = calendarEligibility.eligibleNow;
        return {
            date: ELIGIBLE_NOW_KEY,
            title: 'Eligible Now',
            items,
            count: items.length,
            reclaimGB: items.reduce((sum: number, item: any) => sum + Number(item.sizeGB || 0), 0)
        };
    }
    const day = calendarEligibility.eligibleLaterByDay.find((group: any) => group.date === selectedCalendarDate);
    if (!day) return null;
    return {
        ...day,
        title: new Date(`${day.date}T00:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
    };
};
