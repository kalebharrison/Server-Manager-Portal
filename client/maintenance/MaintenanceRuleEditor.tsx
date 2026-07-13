import React from 'react';
import { CustomSelect, StyledCheckbox } from '../shared/ui';
import {
    createMaintenanceCondition,
    type MaintenanceCondition,
    type MaintenanceField,
    type MaintenanceRule
} from './maintenanceRuleModels';

type ConditionRowProps = {
    condition: MaintenanceCondition;
    fields: MaintenanceField[];
    onChange: (condition: MaintenanceCondition) => void;
    onDelete: () => void;
};

const MaintenanceConditionRow: React.FC<ConditionRowProps> = ({ condition, fields, onChange, onDelete }) => {
    const fieldDef = fields.find((field) => field.field === condition.field) || fields[0];
    const operatorOptions = (fieldDef?.operators || ['equals']).map((operator) => ({
        label: operator.replace(/_/g, ' '),
        value: operator
    }));
    const selectedOperator = operatorOptions.find((option) => option.value === condition.operator)?.value || operatorOptions[0]?.value || 'equals';

    const updateField = (field: string) => {
        const nextField = fields.find((candidate) => candidate.field === field) || fields[0];
        const operator = (nextField?.operators || ['equals'])[0];
        const value = nextField?.type === 'boolean' ? false : (nextField?.type === 'number' ? 0 : (nextField?.options?.[0] ?? ''));
        onChange({ ...condition, field, operator, value });
    };

    return (
        <div className="grid grid-cols-1 md:grid-cols-[1.5fr_1fr_2fr_auto] gap-2 p-1">
            <CustomSelect
                value={condition.field}
                onChange={updateField}
                options={fields.map((field) => ({ label: field.label, value: field.field }))}
                compact
            />
            <CustomSelect
                value={selectedOperator}
                onChange={(operator) => onChange({ ...condition, operator })}
                options={operatorOptions}
                compact
            />
            {fieldDef?.type === 'boolean' ? (
                <CustomSelect
                    value={String(condition.value)}
                    onChange={(value) => onChange({ ...condition, value: value === 'true' })}
                    options={[{ label: 'True', value: 'true' }, { label: 'False', value: 'false' }]}
                    compact
                />
            ) : fieldDef?.type === 'select' ? (
                <CustomSelect
                    value={String(condition.value ?? '')}
                    onChange={(value) => onChange({ ...condition, value })}
                    options={(fieldDef.options || []).map((option) => ({ label: option, value: option }))}
                    compact
                />
            ) : (
                <input
                    type={fieldDef?.type === 'number' ? 'number' : 'text'}
                    value={Array.isArray(condition.value) ? condition.value.join(',') : String(condition.value ?? '')}
                    onChange={(event) => {
                        const raw = event.target.value;
                        if (selectedOperator === 'between' || selectedOperator === 'in' || selectedOperator === 'not_in') {
                            const values = raw.split(',').map((value) => value.trim()).filter(Boolean);
                            onChange({ ...condition, value: fieldDef?.type === 'number' ? values.map(Number) : values });
                            return;
                        }
                        onChange({ ...condition, value: fieldDef?.type === 'number' ? Number(raw) : raw });
                    }}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-border bg-background text-text outline-none focus:border-plex"
                    placeholder={selectedOperator === 'between' ? 'min,max' : (selectedOperator === 'in' || selectedOperator === 'not_in') ? 'v1,v2' : 'value'}
                />
            )}
            <button type="button" onClick={onDelete} className="px-2 py-1 text-[11px] rounded-lg border border-red-500/40 text-red-300 hover:bg-red-500/10">Remove</button>
        </div>
    );
};

type Props = {
    rule: MaintenanceRule;
    fields: MaintenanceField[];
    dirty: boolean;
    saving: boolean;
    previewing: boolean;
    running: boolean;
    pinCollectionOnDestructiveRun: boolean;
    onChange: (rule: MaintenanceRule) => void;
    onClose: () => void;
    onDelete: () => void;
    onPinCollectionChange: (checked: boolean) => void;
    onPreview: () => void;
    onRun: (dryRun: boolean) => void;
    onSave: () => void;
};

export const MaintenanceRuleEditor: React.FC<Props> = ({
    rule,
    fields,
    dirty,
    saving,
    previewing,
    running,
    pinCollectionOnDestructiveRun,
    onChange,
    onClose,
    onDelete,
    onPinCollectionChange,
    onPreview,
    onRun,
    onSave
}) => {
    const update = (patch: Partial<MaintenanceRule>) => onChange({ ...rule, ...patch });
    const conditions = rule.filterTree?.conditions || [];
    const updateConditions = (nextConditions: MaintenanceCondition[]) => update({
        filterTree: { logic: rule.filterTree?.logic || 'AND', conditions: nextConditions }
    });

    return (
        <div className="glass-card-sm p-4 space-y-4 w-full">
            {dirty && (
                <div className="bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs rounded-lg px-3 py-2">
                    You have unsaved changes. Save the filter before previewing or running against production rules.
                </div>
            )}
            <div className="flex items-end justify-between gap-3">
                <div className="flex-1">
                    <label className="text-xs text-muted font-bold uppercase mb-1 block">Filter Name</label>
                    <input
                        value={rule.name || ''}
                        onChange={(event) => update({ name: event.target.value })}
                        className="w-full px-2.5 py-1.5 text-xs rounded border border-border bg-card text-text outline-none focus:border-plex"
                        placeholder="Filter name"
                    />
                </div>
                <div className="flex gap-2">
                    <button type="button" className="px-2.5 py-1.5 text-xs border border-border text-text rounded hover:bg-white/5" onClick={onClose}>Close Editor</button>
                    <button type="button" className="px-2.5 py-1.5 text-xs border border-red-500/40 text-red-300 rounded hover:bg-red-500/10 disabled:opacity-50" onClick={onDelete} disabled={saving}>Delete Filter</button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div>
                    <label className="text-xs text-muted font-bold uppercase" title="How rule conditions are combined.">Match Logic</label>
                    <CustomSelect
                        value={rule.filterTree?.logic || 'AND'}
                        onChange={(logic) => update({ filterTree: { ...(rule.filterTree || {}), logic } })}
                        options={[{ label: 'AND', value: 'AND' }, { label: 'OR', value: 'OR' }, { label: 'NOT', value: 'NOT' }]}
                        compact
                    />
                </div>
                <div>
                    <label className="text-xs text-muted font-bold uppercase" title="Global grace period for this ruleset. Matching items become eligible this many days after the rule was created.">Grace Days</label>
                    <input type="number" min={0} className="w-full px-3 py-2 text-xs rounded-lg border border-border bg-card text-text" value={rule.graceDays || 0} onChange={(event) => update({ graceDays: Number(event.target.value) })} />
                </div>
                <div>
                    <label className="text-xs text-muted font-bold uppercase">Max Actions</label>
                    <input type="number" min={1} className="w-full px-3 py-2 text-xs rounded-lg border border-border bg-card text-text" value={rule.settings?.maxActionsPerRun || 25} onChange={(event) => update({ settings: { ...(rule.settings || {}), maxActionsPerRun: Number(event.target.value) } })} />
                </div>
                <div>
                    <label className="text-xs text-muted font-bold uppercase">Collection Name</label>
                    <input type="text" className="w-full px-3 py-2 text-xs rounded-lg border border-border bg-card text-text" value={rule.collection?.nameTemplate || 'Leaving Soon - {{ruleName}}'} onChange={(event) => update({ collection: { ...(rule.collection || {}), nameTemplate: event.target.value } })} />
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <StyledCheckbox checked={rule.collection?.enabled !== false} onChange={(enabled) => update({ collection: { ...(rule.collection || {}), enabled } })} label="Create / Sync Plex Collection" />
                <StyledCheckbox checked={rule.actions?.deleteFromArr !== false} onChange={(deleteFromArr) => update({ actions: { ...(rule.actions || {}), deleteFromArr } })} label="Delete via Sonarr/Radarr" />
                <StyledCheckbox checked={!!rule.actions?.deleteFiles} onChange={(deleteFiles) => update({ actions: { ...(rule.actions || {}), deleteFiles } })} label="Delete files on disk" />
            </div>

            <div className="space-y-2">
                {conditions.map((condition, index) => (
                    <MaintenanceConditionRow
                        key={`${rule.id}-${index}`}
                        condition={condition}
                        fields={fields}
                        onChange={(nextCondition) => updateConditions(conditions.map((current, currentIndex) => currentIndex === index ? nextCondition : current))}
                        onDelete={() => updateConditions(conditions.filter((_, currentIndex) => currentIndex !== index))}
                    />
                ))}
                <button type="button" onClick={() => updateConditions([...conditions, createMaintenanceCondition()])} className="px-2 py-1 text-[11px] border border-border rounded-lg text-plex font-semibold">Add Filter Condition</button>
            </div>

            <div className="bg-background/30 border border-white/5 rounded-lg p-3">
                <StyledCheckbox checked={pinCollectionOnDestructiveRun} onChange={onPinCollectionChange} label="On destructive run, create collection and pin to home for all users" />
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
                <button type="button" className="px-2 py-1 text-[11px] bg-plex text-background rounded-md font-semibold hover:opacity-90 disabled:opacity-50" onClick={onSave} disabled={saving}>
                    {saving ? 'Saving...' : 'Save Filter'}
                </button>
                <button type="button" className="px-2 py-1 text-[11px] bg-border text-text rounded-md font-semibold hover:bg-opacity-80 disabled:opacity-50" onClick={onPreview} disabled={previewing}>{previewing ? 'Refreshing Preview...' : 'Preview Matches'}</button>
                <button type="button" className="px-2 py-1 text-[11px] bg-blue-500/20 text-blue-300 rounded-md font-semibold border border-blue-500/30 disabled:opacity-50" onClick={() => onRun(true)} disabled={running}>{running ? 'Running...' : 'Run Dry-Run'}</button>
                <button type="button" className="px-2 py-1 text-[11px] bg-red-500/20 text-red-300 rounded-md font-semibold border border-red-500/30 disabled:opacity-50" onClick={() => onRun(false)} disabled={running}>{running ? 'Executing...' : 'Run Destructive'}</button>
            </div>
        </div>
    );
};
