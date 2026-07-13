import React from 'react';

import { CustomSelect } from '../shared/ui';
import { BRAND_THEME_OPTIONS } from './setupWizardModel';
import {
    SETUP_INPUT_CLASS,
    SETUP_LABEL_CLASS,
    SETUP_SECTION_CARD_CLASS,
    SetupStepHeader,
} from './SetupStepLayout';
import type { SetupWizardForm, UpdateSetupWizardForm } from './setupWizardTypes';

export const BrandingStep: React.FC<{
    stepNumber: number;
    form: SetupWizardForm;
    updateForm: UpdateSetupWizardForm;
    applyBrandTheme: (theme: string) => void;
}> = ({ stepNumber, form, updateForm, applyBrandTheme }) => (
    <div className="flex flex-col gap-6 max-w-2xl">
        <SetupStepHeader
            stepNumber={stepNumber}
            title="Portal Branding"
            description="How your portal looks to users. You can change these anytime in Settings."
        />
        <div className={`${SETUP_SECTION_CARD_CLASS} flex flex-col gap-5`}>
            <div className="flex flex-col gap-2.5">
                <label className={SETUP_LABEL_CLASS}>Public Domain / URL</label>
                <input type="text" className={SETUP_INPUT_CLASS} value={form.publicDomain} onChange={(event) => updateForm({ publicDomain: event.target.value })} placeholder="https://portal.yourdomain.com" />
            </div>
            <div className="flex flex-col gap-2.5">
                <label className={SETUP_LABEL_CLASS}>Theme</label>
                <CustomSelect value={form.brandTheme} onChange={applyBrandTheme} options={BRAND_THEME_OPTIONS} />
            </div>
            <div className="flex flex-col gap-2.5">
                <label className={SETUP_LABEL_CLASS}>Primary Color</label>
                <div className="flex gap-3 items-center">
                    <input
                        type="color"
                        value={form.primaryColor}
                        onChange={(event) => updateForm({ brandTheme: 'custom', primaryColor: event.target.value })}
                        className="w-14 h-14 rounded-xl border border-white/10 cursor-pointer bg-transparent flex-shrink-0"
                    />
                    <input
                        type="text"
                        className={SETUP_INPUT_CLASS}
                        value={form.primaryColor}
                        onChange={(event) => updateForm({ brandTheme: 'custom', primaryColor: event.target.value })}
                        placeholder="#F7C600"
                    />
                </div>
            </div>
            <div className="flex flex-col gap-2.5">
                <label className={SETUP_LABEL_CLASS}>Custom Logo URL (optional)</label>
                <input type="text" className={SETUP_INPUT_CLASS} value={form.customLogoUrl} onChange={(event) => updateForm({ customLogoUrl: event.target.value })} placeholder="https://… or /static/logo.png" />
            </div>
        </div>
    </div>
);
