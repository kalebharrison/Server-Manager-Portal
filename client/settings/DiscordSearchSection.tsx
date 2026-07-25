import React from 'react';

import { SettingHint } from './SettingHint';

export type DiscordSearchSectionProps = {
    discordEnabled: boolean;
    discordBotEnabled: boolean;
    discordLlmEnabled: boolean;
    discordAgentEnabled: boolean;
    discordSearxngUrl: string;
    discordBraveSearchApiKey: string;
    discordTavilyApiKey: string;
    onDiscordSearxngUrlChange: (value: string) => void;
    onDiscordBraveSearchApiKeyChange: (value: string) => void;
    onDiscordTavilyApiKeyChange: (value: string) => void;
};

export const DiscordSearchSection: React.FC<DiscordSearchSectionProps> = ({
    discordEnabled,
    discordBotEnabled,
    discordLlmEnabled,
    discordAgentEnabled,
    discordSearxngUrl,
    discordBraveSearchApiKey,
    discordTavilyApiKey,
    onDiscordSearxngUrlChange,
    onDiscordBraveSearchApiKeyChange,
    onDiscordTavilyApiKeyChange,
}) => {
    const disabled = !discordEnabled || !discordBotEnabled || !discordLlmEnabled || !discordAgentEnabled;
    return (
        <div className="mb-8">
            <h3 className="text-xl font-bold text-plex mb-4 border-b border-border pb-2">Web search</h3>
            <p className="text-sm text-muted mb-4">
                Optional backends for the discovery agent. Tried in order: SearXNG → Brave → Tavily → free DuckDuckGo fallback (no key required).
            </p>
            <SettingHint>
                You do not need to run SearXNG. Leave these blank and DuckDuckGo is used automatically. Configured providers are preferred when they return results.
            </SettingHint>
            <div className="mt-4 mb-4">
                <label htmlFor="discordSearxngUrl">SearXNG base URL (optional)</label>
                <input className="w-full p-3 rounded-lg border border-border bg-background text-text outline-none focus:border-plex focus:ring-1 focus:ring-plex transition-all" id="discordSearxngUrl" type="url" value={discordSearxngUrl} onChange={(event) => onDiscordSearxngUrlChange(event.target.value)} placeholder="http://searxng:8080" disabled={disabled} />
                <div className="mt-2"><SettingHint>Self-hosted; enable `json` in SearXNG search formats. Reachable from the portal container.</SettingHint></div>
            </div>
            <div className="mb-4">
                <label htmlFor="discordBraveSearchApiKey">Brave Search API key (optional)</label>
                <input className="w-full p-3 rounded-lg border border-border bg-background text-text outline-none focus:border-plex focus:ring-1 focus:ring-plex transition-all" id="discordBraveSearchApiKey" type="password" value={discordBraveSearchApiKey} onChange={(event) => onDiscordBraveSearchApiKeyChange(event.target.value)} placeholder="Brave Search API key" disabled={disabled} autoComplete="off" />
            </div>
            <div className="mb-2">
                <label htmlFor="discordTavilyApiKey">Tavily API key (optional)</label>
                <input className="w-full p-3 rounded-lg border border-border bg-background text-text outline-none focus:border-plex focus:ring-1 focus:ring-plex transition-all" id="discordTavilyApiKey" type="password" value={discordTavilyApiKey} onChange={(event) => onDiscordTavilyApiKeyChange(event.target.value)} placeholder="Tavily API key" disabled={disabled} autoComplete="off" />
            </div>
        </div>
    );
};
