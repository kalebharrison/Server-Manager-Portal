import React from 'react';
import { Sparkles } from 'lucide-react';
import { useDiscoverI18n } from './i18n';

/** Match DiscoverGridSizeSelect / CustomSelect compact trigger height. */
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
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-medium transition-colors ${
                checked
                    ? 'bg-plex/15 border-plex/40 text-plex hover:bg-plex/20'
                    : 'bg-background border-border text-text hover:border-plex/50'
            }`}
            title={t('browse.animeHint')}
        >
            <Sparkles className="w-3.5 h-3.5 shrink-0" />
            {t('browse.anime')}
        </button>
    );
};
