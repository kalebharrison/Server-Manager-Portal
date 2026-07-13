import React from 'react';

import { IntegrationTestButton } from '../shared/IntegrationTestButton';
import { CustomSelect } from '../shared/ui';
import { IntegrationHeading } from './integrationDisplay';
import { SettingHint } from './SettingHint';

type MetadataSettingsTabProps = {
    initialSettings: any;
    tmdbApiKey: string;
    tvdbApiKey: string;
    tvdbPin: string;
    cacheRefreshMinutes: number;
    onTmdbApiKeyChange: (value: string) => void;
    onTvdbApiKeyChange: (value: string) => void;
    onTvdbPinChange: (value: string) => void;
    onCacheRefreshMinutesChange: (value: number) => void;
    addToast: (message: string, type?: 'success' | 'error') => void;
};

export const MetadataSettingsTab: React.FC<MetadataSettingsTabProps> = ({
    initialSettings,
    tmdbApiKey,
    tvdbApiKey,
    tvdbPin,
    cacheRefreshMinutes,
    onTmdbApiKeyChange,
    onTvdbApiKeyChange,
    onTvdbPinChange,
    onCacheRefreshMinutesChange,
    addToast,
}) => (
    <div className="mb-8 animate-fade-in">
        <IntegrationHeading app="tmdb" title="TMDB" subtitle="Primary discovery, request, and artwork metadata" />
        <div className="mb-4">
            <label htmlFor="tmdbApiKey">TMDB API Key</label>
            <input className="w-full p-3 rounded-lg border border-border bg-background text-text outline-none focus:border-plex focus:ring-1 focus:ring-plex transition-all" id="tmdbApiKey" type="password" value={tmdbApiKey} onChange={(e) => onTmdbApiKeyChange(e.target.value)} placeholder="TMDB v3 API key" />
            <div className="mt-2">
                <SettingHint>Provides discovery, search, genres, request metadata, and optional portal artwork.</SettingHint>
            </div>
        </div>
        <IntegrationTestButton
            type="tmdb"
            payload={{ tmdbApiKey }}
            disabled={!String(tmdbApiKey || initialSettings.tmdbApiKey || '').trim()}
            className="mb-8"
            onMessage={(message, ok) => addToast(message, ok ? 'success' : 'error')}
        />

        <IntegrationHeading app="tvdb" title="TVDB" subtitle="Optional TV-specific metadata enrichment" className="mt-8" />
        <div className="mb-4">
            <label htmlFor="tvdbApiKey">TVDB API Key</label>
            <input className="w-full p-3 rounded-lg border border-border bg-background text-text outline-none focus:border-plex focus:ring-1 focus:ring-plex transition-all" id="tvdbApiKey" type="password" value={tvdbApiKey} onChange={(e) => onTvdbApiKeyChange(e.target.value)} placeholder="TVDB v4 API key" />
            <div className="mt-2">
                <SettingHint>Fills missing TV summaries, air dates, status, network, genres, and season details when a TVDB ID is available.</SettingHint>
            </div>
        </div>
        <div className="mb-4">
            <label htmlFor="tvdbPin">TVDB Subscriber PIN (optional)</label>
            <input className="w-full p-3 rounded-lg border border-border bg-background text-text outline-none focus:border-plex focus:ring-1 focus:ring-plex transition-all" id="tvdbPin" type="password" value={tvdbPin} onChange={(e) => onTvdbPinChange(e.target.value)} placeholder="Only required for subscriber-supported keys" />
        </div>
        <IntegrationTestButton
            type="tvdb"
            payload={{ tvdbApiKey, tvdbPin }}
            disabled={!String(tvdbApiKey || initialSettings.tvdbApiKey || '').trim()}
            onMessage={(message, ok) => addToast(message, ok ? 'success' : 'error')}
        />

        <div className="mt-10 pt-8 border-t border-border">
            <h3 className="text-lg font-semibold text-text mb-1">Background Cache</h3>
            <p className="text-sm text-muted mb-4">Refreshes library, calendar, request discovery, and poster data before users open those pages.</p>
            <label htmlFor="cacheRefreshMinutes">Refresh Interval</label>
            <CustomSelect
                value={String(cacheRefreshMinutes)}
                onChange={(value) => onCacheRefreshMinutesChange(Number(value))}
                options={[1, 5, 10, 15, 30, 60].map((minutes) => ({
                    value: String(minutes),
                    label: minutes === 1 ? 'Every minute' : `Every ${minutes} minutes`,
                }))}
                className="w-full sm:w-64"
            />
        </div>
    </div>
);
