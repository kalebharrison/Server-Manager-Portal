import React from 'react';
import { Sparkles } from 'lucide-react';
import { discoveryTheme } from './discoveryThemeClasses';
import { useDiscoverI18n } from './i18n';

export const DiscoverAnimeToggle: React.FC<{
    checked: boolean;
    onChange: (checked: boolean) => void;
}> = ({ checked, onChange }) => {
    const { t } = useDiscoverI18n();
    return (
        <button
            type="button"
            onClick={() => onChange(!checked)}
            aria-pressed={checked}
            className={`${discoveryTheme.toolbarBtn} ${checked ? 'bg-plex/15 border-plex/40 text-plex hover:bg-plex/20' : ''}`}
            title={t('browse.animeHint')}
        >
            <Sparkles className="w-4 h-4" />
            {t('browse.anime')}
        </button>
    );
};
