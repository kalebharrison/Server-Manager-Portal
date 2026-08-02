import React from 'react';

import { SettingHint } from './SettingHint';

export type DiscordLlmSectionProps = {
    discordEnabled: boolean;
    discordBotEnabled: boolean;
    discordLlmEnabled: boolean;
    discordLlmUrl: string;
    discordLlmApiKey: string;
    discordLlmModel: string;
    discordAgentEnabled: boolean;
    discordMentionNl: boolean;
    onDiscordLlmEnabledChange: (value: boolean) => void;
    onDiscordLlmUrlChange: (value: string) => void;
    onDiscordLlmApiKeyChange: (value: string) => void;
    onDiscordLlmModelChange: (value: string) => void;
    onDiscordAgentEnabledChange: (value: boolean) => void;
    onDiscordMentionNlChange: (value: boolean) => void;
};

export const DiscordLlmSection: React.FC<DiscordLlmSectionProps> = ({
    discordEnabled,
    discordBotEnabled,
    discordLlmEnabled,
    discordLlmUrl,
    discordLlmApiKey,
    discordLlmModel,
    discordAgentEnabled,
    discordMentionNl,
    onDiscordLlmEnabledChange,
    onDiscordLlmUrlChange,
    onDiscordLlmApiKeyChange,
    onDiscordLlmModelChange,
    onDiscordAgentEnabledChange,
    onDiscordMentionNlChange,
}) => (
    <div className="mb-8">
        <h3 className="text-xl font-bold text-plex mb-4 border-b border-border pb-2">Language model &amp; agent</h3>
        <p className="text-sm text-muted mb-6">
            OpenAI-compatible endpoint — self-hosted Ollama or an external LiteLLM/OpenAI URL. Discovery `/ask` uses tool calling when the agent is enabled.
        </p>
        <label className="flex items-center gap-3 mb-4 cursor-pointer">
            <input type="checkbox" checked={discordLlmEnabled} onChange={(event) => onDiscordLlmEnabledChange(event.target.checked)} disabled={!discordEnabled || !discordBotEnabled} />
            <span className="text-sm text-text">Enable natural language (`/ask` + optional @bot)</span>
        </label>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
                <label htmlFor="discordLlmUrl">LLM base URL</label>
                <input className="w-full p-3 rounded-lg border border-border bg-background text-text outline-none focus:border-plex focus:ring-1 focus:ring-plex transition-all" id="discordLlmUrl" type="url" value={discordLlmUrl} onChange={(event) => onDiscordLlmUrlChange(event.target.value)} placeholder="http://llm.example.internal:11434/v1" disabled={!discordEnabled || !discordBotEnabled || !discordLlmEnabled} />
            </div>
            <div>
                <label htmlFor="discordLlmModel">Model</label>
                <input className="w-full p-3 rounded-lg border border-border bg-background text-text outline-none focus:border-plex focus:ring-1 focus:ring-plex transition-all" id="discordLlmModel" type="text" value={discordLlmModel} onChange={(event) => onDiscordLlmModelChange(event.target.value)} placeholder="qwen2.5:7b" disabled={!discordEnabled || !discordBotEnabled || !discordLlmEnabled} />
            </div>
        </div>
        <div className="mb-4">
            <label htmlFor="discordLlmApiKey">LLM API key</label>
            <input className="w-full p-3 rounded-lg border border-border bg-background text-text outline-none focus:border-plex focus:ring-1 focus:ring-plex transition-all" id="discordLlmApiKey" type="password" value={discordLlmApiKey} onChange={(event) => onDiscordLlmApiKeyChange(event.target.value)} placeholder="ollama (any non-empty) or cloud API key" disabled={!discordEnabled || !discordBotEnabled || !discordLlmEnabled} autoComplete="off" />
        </div>
        <label className="flex items-center gap-3 mb-4 cursor-pointer">
            <input type="checkbox" checked={discordAgentEnabled} onChange={(event) => onDiscordAgentEnabledChange(event.target.checked)} disabled={!discordEnabled || !discordBotEnabled || !discordLlmEnabled} />
            <span className="text-sm text-text">Enable media discovery agent on `/ask`</span>
        </label>
        <label className="flex items-center gap-3 mb-2 cursor-pointer">
            <input type="checkbox" checked={discordMentionNl} onChange={(event) => onDiscordMentionNlChange(event.target.checked)} disabled={!discordEnabled || !discordBotEnabled || !discordLlmEnabled} />
            <span className="text-sm text-text">Allow @bot natural language (requires Message Content intent)</span>
        </label>
        <SettingHint>Ops phrases (`my stats`, queue, live) stay instant. Discovery asks use the agent when the LLM is configured — web search does not require SearXNG.</SettingHint>
    </div>
);
