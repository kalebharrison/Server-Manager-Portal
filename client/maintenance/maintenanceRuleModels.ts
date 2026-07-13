export type MaintenanceConditionValue = string | number | boolean | string[] | number[];

export type MaintenanceCondition = {
    field: string;
    operator: string;
    value: MaintenanceConditionValue;
};

export type MaintenanceField = {
    field: string;
    label: string;
    type?: 'boolean' | 'number' | 'select' | string;
    operators?: string[];
    options?: string[];
};

export type MaintenanceRule = {
    id: string;
    name?: string;
    enabled?: boolean;
    graceDays?: number;
    createdAt?: string;
    settings?: {
        dryRunByDefault?: boolean;
        maxActionsPerRun?: number;
        requireConfirmForDestructive?: boolean;
    };
    collection?: {
        enabled?: boolean;
        nameTemplate?: string;
    };
    actions?: {
        deleteFromArr?: boolean;
        deleteFiles?: boolean;
        unmonitor?: boolean;
        qualityProfileId?: number;
    };
    filterTree?: {
        logic?: string;
        conditions?: MaintenanceCondition[];
    };
    overlay?: unknown;
    _resetGrace?: unknown;
};

export type MaintenancePreviewItem = {
    ratingKey: string;
    title: string;
    thumb?: string;
    libraryTitle?: string;
    mediaType?: string;
    eligible?: boolean;
    arrResolvable?: boolean;
    arrType?: string;
};

export type MaintenancePreview = {
    ruleId: string;
    totalMatches?: number;
    eligibleCount?: number;
    actionableCount?: number;
    unactionableCount?: number;
    inGraceCount?: number;
    graceRemainingDays?: number;
    wouldProcessCount?: number;
    sample?: MaintenancePreviewItem[];
};

export type MaintenanceIndexInfo = {
    itemCount?: number;
    generatedAt?: string;
    requestItemCount?: number;
};

export const createMaintenanceCondition = (): MaintenanceCondition => ({
    field: 'daysSinceLastWatch',
    operator: 'greater_than',
    value: 30
});

export const createMaintenanceRule = (): MaintenanceRule => ({
    id: `maintenance-${Date.now()}`,
    name: 'New Maintenance Rule',
    enabled: true,
    graceDays: 7,
    createdAt: new Date().toISOString(),
    settings: { dryRunByDefault: true, maxActionsPerRun: 25, requireConfirmForDestructive: true },
    collection: { enabled: false, nameTemplate: 'Leaving Soon - {{ruleName}}' },
    actions: { deleteFromArr: true, deleteFiles: true, unmonitor: false, qualityProfileId: 0 },
    filterTree: { logic: 'AND', conditions: [createMaintenanceCondition()] }
});

export const stripMaintenanceRuleTransientFields = ({ overlay: _overlay, _resetGrace, ...rule }: MaintenanceRule) => rule;

export const snapshotMaintenanceRules = (rules: MaintenanceRule[]) => JSON.stringify(
    rules.map(stripMaintenanceRuleTransientFields)
);

export const formatMaintenanceRunSummary = (run: { totals?: Record<string, number> }) => {
    const totals = run.totals || {};
    return [
        `${totals.matched ?? 0} matched`,
        `${totals.deleted ?? 0} deleted`,
        `${totals.skipped ?? 0} skipped`,
        `${totals.failed ?? 0} failed`
    ].join(', ');
};
