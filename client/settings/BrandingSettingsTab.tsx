import React from 'react';

import { BrandingSettingsTabContent } from './BrandingSettingsTabContent';
import type { BrandingSettingsTabProps } from './brandingSettingsTabTypes';

export type { BrandingSettingsTabProps } from './brandingSettingsTabTypes';

export const BrandingSettingsTab: React.FC<BrandingSettingsTabProps> = (props) => (
    <BrandingSettingsTabContent {...props} />
);
