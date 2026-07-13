import React from 'react';

import { themeClasses } from '../shared/theme';

export const SETUP_INPUT_CLASS = themeClasses.inputPremium;
export const SETUP_LABEL_CLASS = themeClasses.labelPremium;
export const SETUP_PRIMARY_BUTTON_CLASS = themeClasses.btnPrimary;
export const SETUP_SECTION_CARD_CLASS = `${themeClasses.sectionCard} p-5 md:p-6`;

export const SetupStepHeader: React.FC<{
    stepNumber: number;
    title: string;
    description: string;
    descriptionClassName?: string;
}> = ({ stepNumber, title, description, descriptionClassName = '' }) => (
    <div>
        <p className={`${SETUP_LABEL_CLASS} mb-2`}>Step {stepNumber}</p>
        <h2 className="text-2xl sm:text-3xl font-black text-text tracking-tight mb-2">{title}</h2>
        <p className={`text-muted text-sm sm:text-base ${descriptionClassName}`}>{description}</p>
    </div>
);
