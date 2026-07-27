import React from 'react';
import { CustomSelect } from '../shared/ui';
import type { UpgraderGridSize } from '../shared/portalLayout';
import { useDiscoverI18n } from './i18n';

export const DiscoverGridSizeSelect: React.FC<{
    value: UpgraderGridSize;
    onChange: (value: UpgraderGridSize) => void;
    className?: string;
}> = ({ value, onChange, className = 'w-44' }) => {
    const { t } = useDiscoverI18n();
    // Small/medium crush dense browse cards — only keep usable sizes.
    const options = [
        { value: 'large', label: t('browse.gridLarge') },
        { value: 'xlarge', label: t('browse.gridXlarge') },
    ];

    const safeValue = value === 'xlarge' ? 'xlarge' : 'large';

    return (
        <CustomSelect
            compact
            value={safeValue}
            onChange={(next) => onChange(next === 'xlarge' ? 'xlarge' : 'large')}
            options={options}
            className={className}
        />
    );
};
