import React from 'react';

import { IntegrationTestButton, type IntegrationTestType } from '../shared/IntegrationTestButton';
import { CustomSelect } from '../shared/ui';
import { ProgramIcon, REQUEST_APP_OPTIONS } from './setupWizardModel';
import {
    SETUP_INPUT_CLASS,
    SETUP_SECTION_CARD_CLASS,
    SetupStepHeader,
} from './SetupStepLayout';
import type { IntegrationTab, SetupWizardForm, UpdateSetupWizardForm } from './setupWizardTypes';

type CredentialsCardProps = {
    label: string;
    description: string;
    type: IntegrationTestType;
    url: string;
    apiKey: string;
    placeholder: string;
    updateUrl: (url: string) => void;
    updateApiKey: (apiKey: string) => void;
};

const CredentialsCard: React.FC<CredentialsCardProps> = ({
    label,
    description,
    type,
    url,
    apiKey,
    placeholder,
    updateUrl,
    updateApiKey,
}) => (
    <div className={`${SETUP_SECTION_CARD_CLASS} flex flex-col gap-3.5`}>
        <div className="flex items-center gap-3">
            <ProgramIcon app={type} label={label} />
            <div>
                <h3 className="font-bold text-text text-base leading-tight">{label}</h3>
                <p className="text-xs text-muted mt-0.5">{description}</p>
            </div>
        </div>
        <input type="text" className={SETUP_INPUT_CLASS} value={url} onChange={(event) => updateUrl(event.target.value)} placeholder={placeholder} />
        <input type="password" className={SETUP_INPUT_CLASS} value={apiKey} onChange={(event) => updateApiKey(event.target.value)} placeholder="API Key" />
        <IntegrationTestButton
            type={type}
            payload={{ [`${type}Url`]: url, [`${type}ApiKey`]: apiKey }}
            disabled={!url || !apiKey}
        />
    </div>
);

export const IntegrationsStep: React.FC<{
    stepNumber: number;
    form: SetupWizardForm;
    updateForm: UpdateSetupWizardForm;
    activeTab: IntegrationTab;
    setActiveTab: (tab: IntegrationTab) => void;
}> = ({ stepNumber, form, updateForm, activeTab, setActiveTab }) => {
    const tabs: Array<{ id: IntegrationTab; label: string }> = [
        { id: 'arr', label: 'Arr Apps' },
        { id: 'requests', label: 'Requests' },
        { id: 'analytics', label: form.mediaServerType === 'jellyfin' ? 'Jellystat' : 'Tautulli' },
    ];

    return (
        <div className="flex flex-col gap-5 max-w-4xl">
            <SetupStepHeader
                stepNumber={stepNumber}
                title="Media Stack"
                description="All optional. Connect the apps that manage requests, downloads, activity, and maintenance."
            />
            <div className="grid grid-cols-3 gap-2 rounded-xl border border-white/10 bg-background/50 p-1.5">
                {tabs.map((tab) => (
                    <button
                        key={tab.id}
                        type="button"
                        onClick={() => setActiveTab(tab.id)}
                        className={`px-3 py-2.5 rounded-lg text-xs sm:text-sm font-bold transition-all ${activeTab === tab.id ? 'bg-plex text-background shadow-lg shadow-plex/20' : 'text-muted hover:text-text hover:bg-white/5'}`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {activeTab === 'arr' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <CredentialsCard
                        label="Sonarr"
                        description="TV series automation"
                        type="sonarr"
                        url={form.sonarrUrl}
                        apiKey={form.sonarrApiKey}
                        placeholder="http://localhost:8989"
                        updateUrl={(sonarrUrl) => updateForm({ sonarrUrl })}
                        updateApiKey={(sonarrApiKey) => updateForm({ sonarrApiKey })}
                    />
                    <CredentialsCard
                        label="Radarr"
                        description="Movie automation"
                        type="radarr"
                        url={form.radarrUrl}
                        apiKey={form.radarrApiKey}
                        placeholder="http://localhost:7878"
                        updateUrl={(radarrUrl) => updateForm({ radarrUrl })}
                        updateApiKey={(radarrApiKey) => updateForm({ radarrApiKey })}
                    />
                </div>
            )}

            {activeTab === 'requests' && (
                <div className={`${SETUP_SECTION_CARD_CLASS} flex flex-col gap-3.5`}>
                    <div className="flex items-center gap-3">
                        <ProgramIcon app={form.requestAppType === 'none' ? (form.mediaServerType === 'jellyfin' ? 'jellyseerr' : 'seerr') : form.requestAppType} label="Request App" />
                        <div>
                            <h3 className="font-bold text-text text-base leading-tight">Request App</h3>
                            <p className="text-xs text-muted mt-0.5">Seerr, Jellyseerr, or Ombi for user requests.</p>
                        </div>
                    </div>
                    <CustomSelect value={form.requestAppType} onChange={(requestAppType) => updateForm({ requestAppType })} options={REQUEST_APP_OPTIONS} />
                    {form.requestAppType !== 'none' && (
                        <>
                            <input type="text" className={SETUP_INPUT_CLASS} value={form.requestAppUrl} onChange={(event) => updateForm({ requestAppUrl: event.target.value })} placeholder="http://localhost:5055" />
                            <input type="password" className={SETUP_INPUT_CLASS} value={form.requestAppApiKey} onChange={(event) => updateForm({ requestAppApiKey: event.target.value })} placeholder="API Key" />
                            <IntegrationTestButton type="requestApp" payload={{ requestAppType: form.requestAppType, requestAppUrl: form.requestAppUrl, requestAppApiKey: form.requestAppApiKey }} disabled={!form.requestAppUrl || !form.requestAppApiKey} />
                        </>
                    )}
                </div>
            )}

            {activeTab === 'analytics' && (form.mediaServerType === 'jellyfin' ? (
                <CredentialsCard
                    label="Jellystat"
                    description="Jellyfin activity and analytics."
                    type="jellystat"
                    url={form.jellystatUrl}
                    apiKey={form.jellystatApiKey}
                    placeholder="http://localhost:3000"
                    updateUrl={(jellystatUrl) => updateForm({ jellystatUrl })}
                    updateApiKey={(jellystatApiKey) => updateForm({ jellystatApiKey })}
                />
            ) : (
                <CredentialsCard
                    label="Tautulli"
                    description="Plex activity and analytics."
                    type="tautulli"
                    url={form.tautulliUrl}
                    apiKey={form.tautulliApiKey}
                    placeholder="http://localhost:8181"
                    updateUrl={(tautulliUrl) => updateForm({ tautulliUrl })}
                    updateApiKey={(tautulliApiKey) => updateForm({ tautulliApiKey })}
                />
            ))}
        </div>
    );
};
