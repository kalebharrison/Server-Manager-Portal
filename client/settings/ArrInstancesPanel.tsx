import React from 'react';
import { Plus, Star, Trash2 } from 'lucide-react';

import { IntegrationTestButton } from '../shared/IntegrationTestButton';
import type { ArrInstance, ArrType } from '../shared/types';
import { IntegrationTitle } from './integrationDisplay';
import { SettingsCollapseSection } from './SettingsCollapseSection';

const LABELS: Record<ArrType, { title: string; subtitle: string; placeholder: string }> = {
    sonarr: { title: 'Sonarr', subtitle: 'TV series automation', placeholder: 'http://localhost:8989' },
    radarr: { title: 'Radarr', subtitle: 'Movie automation', placeholder: 'http://localhost:7878' },
    lidarr: { title: 'Lidarr', subtitle: 'Music automation and download status', placeholder: 'http://localhost:8686' },
};

const createInstance = (type: ArrType, isDefault: boolean): ArrInstance => ({
    id: crypto.randomUUID(),
    type,
    name: LABELS[type].title,
    url: '',
    apiKey: '',
    enabled: true,
    isDefault,
});

const parseOptionalId = (value: string): number | null => {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : null;
};

const parseTagList = (value: string): number[] => (
    value
        .split(/[,\s]+/)
        .map((part) => Number(part.trim()))
        .filter((id) => Number.isFinite(id))
);

type Props = {
    type: ArrType;
    instances: ArrInstance[];
    onChange: (instances: ArrInstance[]) => void;
    onMessage: (message: string, success: boolean) => void;
    className?: string;
};

export const ArrInstancesPanel: React.FC<Props> = ({ type, instances, onChange, onMessage, className = '' }) => {
    const labels = LABELS[type];
    const showRouting = type === 'sonarr' || type === 'radarr';
    const update = (id: string, patch: Partial<ArrInstance>) => onChange(
        instances.map((instance) => instance.id === id ? { ...instance, ...patch } : instance),
    );
    const setDefault = (id: string) => onChange(
        instances.map((instance) => ({ ...instance, isDefault: instance.id === id })),
    );
    const remove = (id: string) => {
        const next = instances.filter((instance) => instance.id !== id);
        if (next.length > 0 && !next.some((instance) => instance.isDefault)) next[0] = { ...next[0], isDefault: true };
        onChange(next);
    };

    const enabledCount = instances.filter((instance) => instance.enabled).length;
    const summary = instances.length === 0
        ? 'Not configured'
        : `${enabledCount} of ${instances.length} enabled`;

    return (
        <SettingsCollapseSection
            className={className}
            defaultOpen={instances.length > 0}
            title={<IntegrationTitle app={type} title={labels.title} subtitle={labels.subtitle} />}
            subtitle={summary}
            headerRight={(
                <button
                    type="button"
                    onClick={() => onChange([...instances, createInstance(type, instances.length === 0)])}
                    className="px-3 py-2 rounded-lg border border-border text-sm font-medium text-text hover:bg-white/5 transition-colors flex items-center gap-2 shrink-0"
                >
                    <Plus className="w-4 h-4" /> Add
                </button>
            )}
        >
            {instances.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border p-5 text-sm text-muted text-center">No instances configured.</div>
            ) : (
                <div className="space-y-4">
                    {instances.map((instance, index) => (
                        <div key={instance.id} className="rounded-lg border border-border bg-background/40 p-4 space-y-3">
                            <div className="flex items-center justify-between gap-3">
                                <span className="text-xs uppercase tracking-wider font-bold text-muted">Instance {index + 1}</span>
                                <div className="flex items-center gap-1">
                                    <button type="button" title={instance.isDefault ? 'Default instance' : 'Set as default'} onClick={() => setDefault(instance.id)} className={`p-2 rounded-lg ${instance.isDefault ? 'text-plex bg-plex/10' : 'text-muted hover:text-text hover:bg-white/5'}`}>
                                        <Star className={`w-4 h-4 ${instance.isDefault ? 'fill-current' : ''}`} />
                                    </button>
                                    <button type="button" title="Remove instance" onClick={() => remove(instance.id)} className="p-2 rounded-lg text-muted hover:text-red-400 hover:bg-red-500/10">
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3">
                                <div>
                                    <label htmlFor={`${instance.id}-name`}>Display Name</label>
                                    <input id={`${instance.id}-name`} className="w-full p-3 rounded-lg border border-border bg-background text-text outline-none focus:border-plex" value={instance.name} onChange={(event) => update(instance.id, { name: event.target.value })} />
                                </div>
                                <label className="flex items-end gap-2 pb-3 text-sm text-text cursor-pointer">
                                    <input type="checkbox" checked={instance.enabled} onChange={(event) => update(instance.id, { enabled: event.target.checked })} /> Enabled
                                </label>
                            </div>
                            <div>
                                <label htmlFor={`${instance.id}-url`}>URL</label>
                                <input id={`${instance.id}-url`} className="w-full p-3 rounded-lg border border-border bg-background text-text outline-none focus:border-plex" value={instance.url} onChange={(event) => update(instance.id, { url: event.target.value })} placeholder={labels.placeholder} />
                            </div>
                            <div>
                                <label htmlFor={`${instance.id}-key`}>API Key</label>
                                <input id={`${instance.id}-key`} type="password" className="w-full p-3 rounded-lg border border-border bg-background text-text outline-none focus:border-plex" value={instance.apiKey} onChange={(event) => update(instance.id, { apiKey: event.target.value })} placeholder="API key" />
                            </div>
                            {showRouting && (
                                <div className="rounded-lg border border-border/60 bg-background/30 p-3 space-y-3">
                                    <p className="text-xs uppercase tracking-wider font-bold text-muted">Portal request defaults</p>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        <div>
                                            <label htmlFor={`${instance.id}-profile`}>Quality Profile ID</label>
                                            <input
                                                id={`${instance.id}-profile`}
                                                className="w-full p-3 rounded-lg border border-border bg-background text-text outline-none focus:border-plex"
                                                value={instance.activeProfileId ?? ''}
                                                onChange={(event) => update(instance.id, { activeProfileId: parseOptionalId(event.target.value) })}
                                                placeholder="e.g. 8"
                                                inputMode="numeric"
                                            />
                                        </div>
                                        <div>
                                            <label htmlFor={`${instance.id}-root`}>Root Folder</label>
                                            <input
                                                id={`${instance.id}-root`}
                                                className="w-full p-3 rounded-lg border border-border bg-background text-text outline-none focus:border-plex"
                                                value={instance.activeDirectory || ''}
                                                onChange={(event) => update(instance.id, { activeDirectory: event.target.value })}
                                                placeholder={type === 'sonarr' ? '/media/current/tv.shows' : '/media/current/movies'}
                                            />
                                        </div>
                                        <div>
                                            <label htmlFor={`${instance.id}-anime-profile`}>Anime Quality Profile ID</label>
                                            <input
                                                id={`${instance.id}-anime-profile`}
                                                className="w-full p-3 rounded-lg border border-border bg-background text-text outline-none focus:border-plex"
                                                value={instance.activeAnimeProfileId ?? ''}
                                                onChange={(event) => update(instance.id, { activeAnimeProfileId: parseOptionalId(event.target.value) })}
                                                placeholder="Same as default if blank"
                                                inputMode="numeric"
                                            />
                                        </div>
                                        <div>
                                            <label htmlFor={`${instance.id}-anime-root`}>Anime Root Folder</label>
                                            <input
                                                id={`${instance.id}-anime-root`}
                                                className="w-full p-3 rounded-lg border border-border bg-background text-text outline-none focus:border-plex"
                                                value={instance.activeAnimeDirectory || ''}
                                                onChange={(event) => update(instance.id, { activeAnimeDirectory: event.target.value })}
                                                placeholder={type === 'sonarr' ? '/media/current/anime.shows' : '/media/current/anime.movies'}
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label htmlFor={`${instance.id}-anime-tags`}>Anime Tags (comma-separated IDs)</label>
                                        <input
                                            id={`${instance.id}-anime-tags`}
                                            className="w-full p-3 rounded-lg border border-border bg-background text-text outline-none focus:border-plex"
                                            value={(instance.animeTags || []).join(', ')}
                                            onChange={(event) => update(instance.id, { animeTags: parseTagList(event.target.value) })}
                                            placeholder={type === 'sonarr' ? 'e.g. 36, 39' : 'Optional'}
                                        />
                                    </div>
                                </div>
                            )}
                            <IntegrationTestButton
                                type={type}
                                payload={{ instanceId: instance.id, [`${type}Url`]: instance.url, [`${type}ApiKey`]: instance.apiKey }}
                                disabled={!String(instance.url).trim() || !String(instance.apiKey).trim()}
                                onMessage={onMessage}
                            />
                        </div>
                    ))}
                </div>
            )}
        </SettingsCollapseSection>
    );
};
