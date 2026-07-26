import React from 'react';
import { discoveryTheme } from './discoveryThemeClasses';
import { useDiscoverI18n } from './i18n';

export const DiscoverForeignToggle: React.FC<{
    checked: boolean;
    onChange: (checked: boolean) => void;
}> = ({ checked, onChange }) => {
    const { t } = useDiscoverI18n();
    return (
        <button
            type="button"
            onClick={() => onChange(!checked)}
            aria-pressed={checked}
            className={`${checked ? discoveryTheme.filterChipActive : discoveryTheme.filterChip}`}
            title={t('browse.foreignHint')}
        >
            {t('browse.foreign')}
        </button>
    );
};
