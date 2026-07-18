import React from 'react';

export const themeOptions = [
    { label: 'Plex Dark', value: 'plex' },
    { label: 'Sleek Slate', value: 'slate' },
    { label: 'Nordic Frost', value: 'nordic' },
    { label: 'Jellyfin Purple', value: 'jellyfin' },
    { label: 'Emerald Green', value: 'emerald' },
    { label: 'Neon Midnight', value: 'midnight' },
];

export const ToggleRow: React.FC<{
    checked: boolean;
    disabled?: boolean;
    label: string;
    onToggle: () => void;
}> = ({ checked, disabled, label, onToggle }) => (
    <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={onToggle}
        className={`relative inline-flex h-7 w-12 shrink-0 rounded-full border-2 transition-colors disabled:opacity-50 ${checked ? 'bg-plex border-plex' : 'bg-background border-border'}`}
    >
        <span className={`mt-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : 'translate-x-0.5'}`} />
    </button>
);
