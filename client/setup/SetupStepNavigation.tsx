import React from 'react';
import { Check } from 'lucide-react';

import { STEPS, type StepId } from './setupWizardModel';

export const SetupStepNavigation: React.FC<{ step: StepId; stepIndex: number; compact?: boolean }> = ({
    step,
    stepIndex,
    compact = false,
}) => (
    <>
        {STEPS.map((s, i) => {
            const Icon = s.icon;
            const active = s.id === step;
            const done = i < stepIndex;
            return (
                <div
                    key={s.id}
                    className={`flex items-start gap-3 rounded-xl transition-all duration-300 ${compact ? 'flex-shrink-0 px-3 py-2' : 'p-3'} ${active ? 'bg-plex/10 border border-plex/25 shadow-[0_0_24px_rgba(229,160,13,0.12)]' : done ? 'opacity-90' : 'opacity-50'}`}
                >
                    <div className={`flex-shrink-0 rounded-full flex items-center justify-center border-2 transition-all ${compact ? 'w-8 h-8' : 'w-10 h-10'} ${active ? 'border-plex bg-plex/20 text-plex shadow-[0_0_18px_rgba(229,160,13,0.35)]' : done ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400' : 'border-white/10 bg-white/5 text-muted'}`}>
                        {done ? <Check className={compact ? 'w-3.5 h-3.5' : 'w-4 h-4'} /> : <Icon className={compact ? 'w-3.5 h-3.5' : 'w-4 h-4'} />}
                    </div>
                    {!compact && (
                        <div className="min-w-0 pt-0.5">
                            <p className={`text-sm font-bold leading-tight ${active ? 'text-text' : done ? 'text-emerald-400/90' : 'text-muted'}`}>{s.label}</p>
                            <p className="text-xs text-muted/80 mt-0.5 leading-snug">{s.hint}</p>
                        </div>
                    )}
                    {compact && (
                        <span className={`text-xs font-bold whitespace-nowrap ${active ? 'text-plex' : done ? 'text-emerald-400' : 'text-muted'}`}>{s.label}</span>
                    )}
                </div>
            );
        })}
    </>
);
