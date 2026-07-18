import React from 'react';

import { CustomSelect } from '../shared/ui';
import { krGetOps, RULE_FIELDS } from './streamKillRulesConstants';

export const StreamKillConditionRow: React.FC<{ cond: any; onCh: (c: any) => void; onDel: () => void }> = ({ cond, onCh, onDel }) => {
    const fd = RULE_FIELDS.find(f => f.value === cond.field);
    const ops = krGetOps(fd);
    const onField = (v: string) => {
        const def = RULE_FIELDS.find(f => f.value === v);
        const dv = def?.type === 'bool' ? 'true' : (def && 'options' in def && def.options ? def.options[0] : '');
        onCh({ ...cond, field: v, value: dv, operator: krGetOps(def)[0].value });
    };
    const fieldOptions = RULE_FIELDS.map(f => ({ label: f.label, value: f.value }));
    const opOptions = ops.map(o => ({ label: o.label, value: o.value }));
    const boolOptions = [{ label: 'Yes / True', value: 'true' }, { label: 'No / False', value: 'false' }];
    const selectOptions = ('options' in (fd ?? {}) && (fd as any).options)
        ? (fd as any).options.map((o: string) => ({ label: o, value: o }))
        : [];

    return (
        <div className="flex flex-wrap items-center gap-2 py-2 border-b border-border/30 last:border-b-0">
            <CustomSelect
                value={cond.field}
                onChange={v => onField(v)}
                options={fieldOptions}
                className="flex-shrink-0 min-w-[160px]"
            />
            <CustomSelect
                value={cond.operator}
                onChange={v => onCh({ ...cond, operator: v })}
                options={opOptions}
                className="flex-shrink-0 min-w-[130px]"
            />
            {fd?.type === 'bool' ? (
                <CustomSelect
                    value={cond.value}
                    onChange={v => onCh({ ...cond, value: v })}
                    options={boolOptions}
                    className="flex-1 min-w-[110px]"
                />
            ) : fd?.type === 'select' ? (
                <CustomSelect
                    value={cond.value}
                    onChange={v => onCh({ ...cond, value: v })}
                    options={selectOptions}
                    className="flex-1 min-w-[110px]"
                />
            ) : (
                <input type={fd?.type === 'number' ? 'number' : 'text'} value={cond.value}
                    onChange={e => onCh({ ...cond, value: e.target.value })}
                    placeholder={fd?.type === 'number' ? 'e.g. 20' : 'e.g. Plex Web'}
                    className="flex-1 min-w-[100px] bg-background border border-border text-text rounded-lg px-3 py-2 text-sm focus:border-plex focus:ring-1 focus:ring-plex outline-none transition-all" />
            )}
            <button onClick={onDel} title="Remove" className="p-1.5 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-all flex-shrink-0">
                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
            </button>
        </div>
    );
};
