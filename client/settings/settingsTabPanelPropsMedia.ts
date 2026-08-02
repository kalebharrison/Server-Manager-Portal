import type { SettingsTabPanelProps } from './SettingsTabPanel';
import type { SettingsFormValues } from './useSettingsFormState';
import type { SettingsTabPanelOnChange } from './settingsTabPanelPropsTypes';

type MediaTabPanelPropsInput = {
    initialSettings: any;
    values: SettingsFormValues;
    onChange: SettingsTabPanelOnChange;
    handleFetchServers: () => Promise<void>;
    addToast: SettingsTabPanelProps['addToast'];
};

export const buildMediaServerTabPanelProps = ({
    initialSettings,
    values,
    onChange,
    handleFetchServers,
    addToast,
}: MediaTabPanelPropsInput): SettingsTabPanelProps['mediaServer'] => ({
    initialSettings,
    mediaServerType: values.mediaServerType,
    token: values.token,
    plexServerUrl: values.plexServerUrl,
    jellyfinUrl: values.jellyfinUrl,
    jellyfinApiKey: values.jellyfinApiKey,
    servers: values.servers,
    selectedServer: values.selectedServer,
    onMediaServerTypeChange: onChange('mediaServerType'),
    onTokenChange: onChange('token'),
    onPlexServerUrlChange: onChange('plexServerUrl'),
    onJellyfinUrlChange: onChange('jellyfinUrl'),
    onJellyfinApiKeyChange: onChange('jellyfinApiKey'),
    onSelectedServerChange: onChange('selectedServer'),
    onFetchServers: handleFetchServers,
    addToast,
});

export const buildMediaStackTabPanelProps = ({
    initialSettings,
    values,
    onChange,
    addToast,
}: Omit<MediaTabPanelPropsInput, 'handleFetchServers'>): SettingsTabPanelProps['mediaStack'] => ({
    initialSettings,
    mediaServerType: values.mediaServerType,
    arrInstances: values.arrInstances,
    tautulliUrl: values.tautulliUrl,
    tautulliApiKey: values.tautulliApiKey,
    jellystatUrl: values.jellystatUrl,
    jellystatApiKey: values.jellystatApiKey,
    qcQbitUrl: values.qcQbitUrl,
    qcQbitUsername: values.qcQbitUsername,
    qcQbitPassword: values.qcQbitPassword,
    qcSabUrl: values.qcSabUrl,
    qcSabApiKey: values.qcSabApiKey,
    onArrInstancesChange: onChange('arrInstances'),
    onTautulliUrlChange: onChange('tautulliUrl'),
    onTautulliApiKeyChange: onChange('tautulliApiKey'),
    onJellystatUrlChange: onChange('jellystatUrl'),
    onJellystatApiKeyChange: onChange('jellystatApiKey'),
    onQcQbitUrlChange: onChange('qcQbitUrl'),
    onQcQbitUsernameChange: onChange('qcQbitUsername'),
    onQcQbitPasswordChange: onChange('qcQbitPassword'),
    onQcSabUrlChange: onChange('qcSabUrl'),
    onQcSabApiKeyChange: onChange('qcSabApiKey'),
    addToast,
});

export const buildMetadataTabPanelProps = ({
    initialSettings,
    values,
    onChange,
    addToast,
}: Omit<MediaTabPanelPropsInput, 'handleFetchServers'>): SettingsTabPanelProps['metadata'] => ({
    initialSettings,
    tmdbApiKey: values.tmdbApiKey,
    tvdbApiKey: values.tvdbApiKey,
    tvdbPin: values.tvdbPin,
    cacheRefreshMinutes: values.cacheRefreshMinutes,
    onTmdbApiKeyChange: onChange('tmdbApiKey'),
    onTvdbApiKeyChange: onChange('tvdbApiKey'),
    onTvdbPinChange: onChange('tvdbPin'),
    onCacheRefreshMinutesChange: onChange('cacheRefreshMinutes'),
    addToast,
});
