import React from 'react';

import {
    JELLYFIN_BRAND_BACKGROUND_URL,
    JELLYFIN_BRAND_LOGO_URL,
} from './BrandingSettingsTabShared';

export const BrandingSettingsLogoSection: React.FC<{
    mediaServerType: 'plex' | 'jellyfin';
    customLogoUrl: string;
    onCustomLogoUrlChange: (value: string) => void;
    onBackgroundImageUrlChange: (value: string) => void;
    onLogoFileChange: (file: File | null) => void;
    addToast: (message: string, type?: 'success' | 'error') => void;
}> = ({
    mediaServerType,
    customLogoUrl,
    onCustomLogoUrlChange,
    onBackgroundImageUrlChange,
    onLogoFileChange,
    addToast,
}) => {
    const applyJellyfinBranding = () => {
        onCustomLogoUrlChange(JELLYFIN_BRAND_LOGO_URL);
        onBackgroundImageUrlChange(JELLYFIN_BRAND_BACKGROUND_URL);
        onLogoFileChange(null);
        addToast('Jellyfin server icon and splash background applied. Save settings to publish.');
    };

    return (
        <>
            {mediaServerType === 'jellyfin' && (
                <div className="mb-4 rounded-lg border border-plex/30 bg-plex/10 p-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex items-center gap-3 min-w-0">
                            <span className="w-11 h-11 rounded-lg bg-background border border-plex/30 flex items-center justify-center overflow-hidden flex-shrink-0">
                                <img src={JELLYFIN_BRAND_LOGO_URL} alt="" className="w-8 h-8 object-contain" />
                            </span>
                            <div className="min-w-0">
                                <h4 className="font-bold text-text">Jellyfin branding</h4>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={applyJellyfinBranding}
                            className="px-4 py-2 bg-plex hover:bg-plex-hover text-background rounded-md font-bold transition-colors whitespace-nowrap"
                        >
                            Use Jellyfin icon & splash
                        </button>
                    </div>
                </div>
            )}

            <div className="mb-4">
                <label>Custom Logo</label>
                <div className="flex flex-col gap-2">
                    <input type="url" className="w-full p-3 rounded-lg border border-border bg-background text-text outline-none focus:border-plex transition-all" value={customLogoUrl} onChange={e => onCustomLogoUrlChange(e.target.value)} placeholder="https://example.com/logo.png" />
                    <span className="text-center text-muted font-bold text-sm">OR</span>
                    <input type="file" accept="image/*" className="w-full p-2 rounded-lg border border-border bg-background text-muted text-sm outline-none focus:border-plex transition-all file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-xs file:font-bold file:bg-white/10 file:text-text hover:file:bg-white/20 file:cursor-pointer cursor-pointer" onChange={e => onLogoFileChange(e.target.files?.[0] || null)} />
                </div>
                <p className="mt-2 text-xs text-muted">URL or upload, max 5MB.</p>
            </div>
        </>
    );
};
