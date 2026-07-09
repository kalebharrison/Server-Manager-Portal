export type MaintenanceSection = {
    id: string;
    label: string;
};

export type OverviewInsights = {
    totalMatches: number;
    uniqueMatches: number;
    estimatedReclaimGB: number;
    libraries: Array<{ libraryTitle: string; count: number; reclaimGB: number }>;
    rules: Array<{ ruleId: string; ruleName: string; totalMatches: number; reclaimGB: number }>;
};

export type ExclusionsSummary = {
    ratingKeys: any[];
    titles: any[];
    libraries: any[];
};

export const MAINTENANCE_SECTIONS: MaintenanceSection[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'exclusions', label: 'Exclusions' },
    { id: 'rules', label: 'Rules' },
    { id: 'collections', label: 'Collections' },
    { id: 'candidates', label: 'Candidates' },
    { id: 'calendar', label: 'Calendar' },
    { id: 'storage', label: 'Storage Metrics' },
    { id: 'library', label: 'Rule Library' },
    { id: 'settings', label: 'Cleaner Settings' },
    { id: 'runs', label: 'Logs' }
];

export const getDefaultMaintenancePreferences = () => ({
    global: { dryRunByDefault: true, maxActionsPerRun: 25, requireConfirmForDestructive: true },
    exclusions: { ratingKeys: [], titles: [], libraries: [] }
});

export const getEmptyOverviewInsights = (): OverviewInsights => ({
    totalMatches: 0,
    uniqueMatches: 0,
    estimatedReclaimGB: 0,
    libraries: [],
    rules: []
});

export const getEmptyExclusionsSummary = (): ExclusionsSummary => ({
    ratingKeys: [],
    titles: [],
    libraries: []
});

export const getInitialMaintenanceSection = (hash: string) => {
    const cleanHash = hash.replace('#', '');
    if (cleanHash.startsWith('maintenance-')) {
        const section = cleanHash.replace('maintenance-', '');
        if (section === 'overlays') return 'overview';
        return section;
    }
    return 'overview';
};

export const isMaintenanceDisabledError = (error: any) => {
    const msg = String(error?.message || '');
    return msg.includes('Maintenance Experimental Mode is disabled');
};

export const buildOverviewInsights = (previewData: any): OverviewInsights => {
    const previewAll = Array.isArray(previewData?.previews) ? previewData.previews : [];
    const uniqueItems = new Map<string, any>();
    const libraryMap: Record<string, { libraryTitle: string; count: number; reclaimGB: number }> = {};
    const ruleInsights = previewAll.map((preview: any) => {
        const sample = Array.isArray(preview?.sample) ? preview.sample : [];
        let ruleReclaim = 0;
        sample.forEach((item: any) => {
            const ratingKey = String(item?.ratingKey || '');
            if (ratingKey && !uniqueItems.has(ratingKey)) uniqueItems.set(ratingKey, item);
            const size = Number(item?.sizeGB || 0);
            ruleReclaim += size;
            const libraryTitle = item?.libraryTitle || 'Unknown Library';
            if (!libraryMap[libraryTitle]) libraryMap[libraryTitle] = { libraryTitle, count: 0, reclaimGB: 0 };
            libraryMap[libraryTitle].count += 1;
            libraryMap[libraryTitle].reclaimGB += size;
        });
        return {
            ruleId: String(preview?.ruleId || ''),
            ruleName: preview?.ruleName || 'Unnamed Rule',
            totalMatches: Number(preview?.totalMatches || sample.length || 0),
            reclaimGB: ruleReclaim
        };
    });
    const uniqueValues = Array.from(uniqueItems.values());
    const estimatedReclaimGB = uniqueValues.reduce((sum: number, item: any) => sum + Number(item?.sizeGB || 0), 0);
    const totalMatches = ruleInsights.reduce((sum: number, rule: any) => sum + Number(rule.totalMatches || 0), 0);
    return {
        totalMatches,
        uniqueMatches: uniqueValues.length,
        estimatedReclaimGB,
        libraries: Object.values(libraryMap).sort((a, b) => b.reclaimGB - a.reclaimGB),
        rules: ruleInsights.sort((a: any, b: any) => b.reclaimGB - a.reclaimGB)
    };
};

export const normalizeExclusionsSummary = (payload: any): ExclusionsSummary => ({
    ratingKeys: Array.isArray(payload?.ratingKeys) ? payload.ratingKeys : [],
    titles: Array.isArray(payload?.titles) ? payload.titles : [],
    libraries: Array.isArray(payload?.libraries) ? payload.libraries : []
});

export const filterCandidateItems = (candidateItems: any[], candidateSearch: string) => candidateItems.filter((item: any) => {
    if (!candidateSearch.trim()) return true;
    const q = candidateSearch.trim().toLowerCase();
    return `${item.title || ''} ${item.libraryTitle || ''}`.toLowerCase().includes(q);
});
