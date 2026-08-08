import React from 'react';

export const JELLYFIN_BRAND_LOGO_URL = '/api/jellyfin/branding/icon';
export const JELLYFIN_BRAND_BACKGROUND_URL = '/api/jellyfin/branding/splash';

export const ToggleRow: React.FC<{
    title: string;
    checked: boolean;
    onChange: (value: boolean) => void;
    children?: React.ReactNode;
}> = ({ title, checked, onChange, children }) => (
    <div className="mb-4 mt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-4 border-b border-border/40">
        <div>
            <h4 className="font-bold text-text">{title}</h4>
            {children}
        </div>
        <label className="relative inline-flex items-center cursor-pointer ml-4 flex-shrink-0">
            <input
                type="checkbox"
                className="sr-only peer"
                checked={checked}
                onChange={e => onChange(e.target.checked)}
            />
            <div className="w-11 h-6 bg-background peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-text after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-plex"></div>
        </label>
    </div>
);

export const InlineSwitch: React.FC<{
    label: string;
    checked: boolean;
    onChange: (value: boolean) => void;
}> = ({ label, checked, onChange }) => (
    <div className="flex items-center gap-2 mt-2">
        <button type="button" onClick={() => onChange(!checked)} className={`relative inline-flex items-center h-6 rounded-full w-11 transition-colors flex-shrink-0 cursor-pointer ${checked ? 'bg-plex' : 'bg-border'}`}>
            <span className={`inline-block w-4 h-4 transform bg-white rounded-full shadow-sm transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
        </button>
        <span className="text-sm font-medium cursor-pointer select-none hover:text-plex transition-colors" onClick={() => onChange(!checked)}>{label}</span>
    </div>
);
