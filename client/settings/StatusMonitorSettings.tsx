import React from 'react';

import { CustomSelect } from '../shared/ui';
import { SettingHint } from './SettingHint';
import { SettingsCollapseSection } from './SettingsCollapseSection';
import { useStatusMonitorConfig } from './useStatusMonitorConfig';

export const StatusMonitorSettings: React.FC<{
    config: any;
    publicStatusEnabled: boolean;
    onPublicStatusEnabledChange: (enabled: boolean) => void;
    onChange: (cfg: any) => void;
    appConfirm: (msg: string, cb: () => void) => void;
    addToast: (msg: string, type?: 'success' | 'error') => void;
}> = ({ config, publicStatusEnabled, onPublicStatusEnabledChange, onChange, appConfirm, addToast }) => {
    const {
        localConfig,
        addGroup,
        addService,
        updateGroup,
        updateService,
        removeGroup,
        removeService,
        handleResetStats,
    } = useStatusMonitorConfig({ config, onChange, appConfirm, addToast });

    return (
        <div className="flex flex-col gap-4 w-full">
            <SettingsCollapseSection
                title="Public status page"
                subtitle={publicStatusEnabled ? 'Visitors can view the status page' : 'Signed-in members only'}
            >
                <button
                    type="button"
                    onClick={() => onPublicStatusEnabledChange(!publicStatusEnabled)}
                    className={`px-4 py-2 rounded-md text-sm font-bold transition-colors ${publicStatusEnabled ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30' : 'bg-white/10 text-muted hover:bg-white/20'}`}
                >
                    Public Status: {publicStatusEnabled ? 'Enabled' : 'Disabled'}
                </button>
            </SettingsCollapseSection>

            <SettingsCollapseSection
                title="Service Groups"
                subtitle={`${localConfig.groups.length} group${localConfig.groups.length === 1 ? '' : 's'}`}
                headerRight={(
                    <button type="button" onClick={addGroup} className="px-4 py-2 bg-white/10 hover:bg-white/20 text-text rounded-md text-sm font-bold transition-colors">Add Group</button>
                )}
            >
                <div className="mb-4">
                    <SettingHint>Group names become the section headings on the Status page.</SettingHint>
                </div>
                {localConfig.groups.map((group: any) => (
                    <div key={group.id} className="flex flex-col sm:flex-row sm:items-center gap-3 mb-3">
                        <input
                            type="text"
                            value={group.name}
                            onChange={(e) => updateGroup(group.id, 'name', e.target.value)}
                            className="flex-1 w-full p-3 rounded-lg bg-background border border-border focus:border-plex outline-none text-sm"
                            placeholder="Group Name"
                        />
                        <button type="button" onClick={() => removeGroup(group.id)} className="px-4 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-md text-xs font-bold transition-colors flex-shrink-0 sm:w-[5.75rem]">Remove</button>
                    </div>
                ))}
                {localConfig.groups.length === 0 && <p className="text-muted text-sm italic py-2">No groups defined. Create one to organize your services.</p>}
            </SettingsCollapseSection>

            <SettingsCollapseSection
                title="Monitored Services"
                subtitle={`${localConfig.services.length} service${localConfig.services.length === 1 ? '' : 's'}`}
                headerRight={(
                    <button type="button" onClick={addService} className="px-4 py-2 bg-plex text-background hover:bg-plex-hover rounded-md text-sm font-bold transition-colors shadow-lg">Add Service</button>
                )}
            >
                <div className="mb-4">
                    <SettingHint>These display fields control exactly what members see on the Status page. Connection URLs remain admin-only.</SettingHint>
                </div>
                <div className="flex flex-col gap-6">
                    {localConfig.services.map((service: any) => (
                        <div key={service.id} className="flex flex-col gap-3 pb-6 border-b border-border/40 last:border-b-0 last:pb-0">
                            <div>
                                <label className="block text-sm text-muted mb-1">Public Display Name</label>
                                <input
                                    type="text"
                                    value={service.name}
                                    onChange={(e) => updateService(service.id, 'name', e.target.value)}
                                    className="w-full p-3 rounded-lg bg-background border border-border focus:border-plex outline-none text-sm font-bold"
                                    placeholder="Name shown on the Status page"
                                />
                            </div>
                            <div>
                                <label className="block text-sm text-muted mb-1">Public Subtitle</label>
                                <input
                                    type="text"
                                    value={service.description || ''}
                                    onChange={(e) => updateService(service.id, 'description', e.target.value)}
                                    className="w-full p-3 rounded-lg bg-background border border-border focus:border-plex outline-none text-sm"
                                    placeholder="Short description shown below the service name"
                                />
                            </div>
                            <div>
                                <label className="block text-sm text-muted mb-1">Service URL</label>
                                <input
                                    type="text"
                                    value={service.url}
                                    onChange={(e) => updateService(service.id, 'url', e.target.value)}
                                    disabled={service.id === 'plex' && !service.url}
                                    className="w-full p-3 rounded-lg bg-background border border-border focus:border-plex outline-none text-sm font-mono"
                                    placeholder={service.id === 'plex' ? 'Resolved automatically from Media Server settings' : 'Service URL (e.g. https://...)'}
                                />
                            </div>
                            <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                                <div className="flex items-center gap-2">
                                    <span className="text-muted">Group:</span>
                                    <div className="w-48">
                                        <CustomSelect
                                            value={service.groupId || ''}
                                            onChange={(val) => updateService(service.id, 'groupId', val || null)}
                                            options={[
                                                { label: 'None', value: '' },
                                                ...localConfig.groups.map((g: any) => ({ label: g.name, value: g.id }))
                                            ]}
                                        />
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 flex-shrink-0 ml-auto">
                                    <button type="button" onClick={() => removeService(service.id)} className="px-4 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-md text-xs font-bold transition-colors w-[5.75rem]">Remove</button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
                {localConfig.services.length === 0 && <p className="text-muted text-sm italic py-2">No services defined. Add some services to monitor.</p>}
            </SettingsCollapseSection>

            <SettingsCollapseSection
                title="Reset Statistics"
                subtitle="Clear historical uptime and latency data"
            >
                <div className="mb-4">
                    <SettingHint>Resetting the status statistics will clear all historical uptime and latency data for all monitored services. This action cannot be undone.</SettingHint>
                </div>
                <button
                    type="button"
                    onClick={handleResetStats}
                    className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md text-sm font-bold transition-colors shadow-lg"
                >
                    Reset Uptime Data
                </button>
            </SettingsCollapseSection>
        </div>
    );
};
