import React from 'react';
import { Check } from 'lucide-react';

import { logoUrl } from '../shared/basePath';
import { IntegrationTestButton } from '../shared/IntegrationTestButton';
import type { PlexServer } from '../shared/types';
import { CustomSelect } from '../shared/ui';
import { MEDIA_SERVER_OPTIONS } from './setupWizardModel';
import {
    SETUP_INPUT_CLASS,
    SETUP_LABEL_CLASS,
    SETUP_PRIMARY_BUTTON_CLASS,
    SETUP_SECTION_CARD_CLASS,
    SetupStepHeader,
} from './SetupStepLayout';
import type { SetupWizardForm, UpdateSetupWizardForm } from './setupWizardTypes';

export const MediaServerStep: React.FC<{
    stepNumber: number;
    form: SetupWizardForm;
    updateForm: UpdateSetupWizardForm;
    servers: PlexServer[];
    plexUsername: string;
    showManualToken: boolean;
    setShowManualToken: (show: boolean) => void;
    isLoading: boolean;
    applyMediaServerType: (type: string) => void;
    onPlexSignIn: () => void;
    onFetchServers: () => void;
    onPlexSignOut: () => void;
}> = ({
    stepNumber,
    form,
    updateForm,
    servers,
    plexUsername,
    showManualToken,
    setShowManualToken,
    isLoading,
    applyMediaServerType,
    onPlexSignIn,
    onFetchServers,
    onPlexSignOut,
}) => (
    <div className="flex flex-col gap-6 max-w-2xl">
        <SetupStepHeader
            stepNumber={stepNumber}
            title="Media Server Connection"
            description="Choose and connect the media server that will back this portal."
            descriptionClassName="leading-relaxed"
        />

        <div className={`${SETUP_SECTION_CARD_CLASS} flex flex-col gap-4`}>
            <div className="flex flex-col gap-2.5">
                <label className={SETUP_LABEL_CLASS}>Media Server Type</label>
                <CustomSelect value={form.mediaServerType} onChange={applyMediaServerType} options={MEDIA_SERVER_OPTIONS} />
            </div>
            {form.mediaServerType === 'jellyfin' && (
                <>
                    <div className="flex flex-col gap-2.5">
                        <label className={SETUP_LABEL_CLASS}>Jellyfin URL</label>
                        <input type="url" className={SETUP_INPUT_CLASS} value={form.jellyfinUrl} onChange={(event) => updateForm({ jellyfinUrl: event.target.value })} placeholder="http://192.168.1.6:8096" />
                    </div>
                    <div className="flex flex-col gap-2.5">
                        <label className={SETUP_LABEL_CLASS}>Jellyfin API Key</label>
                        <input type="password" className={SETUP_INPUT_CLASS} value={form.jellyfinApiKey} onChange={(event) => updateForm({ jellyfinApiKey: event.target.value })} placeholder="API key from Jellyfin dashboard" />
                    </div>
                    <IntegrationTestButton type="jellyfin" payload={{ jellyfinUrl: form.jellyfinUrl, jellyfinApiKey: form.jellyfinApiKey }} disabled={!form.jellyfinUrl || !form.jellyfinApiKey} />
                </>
            )}
        </div>

        {form.mediaServerType === 'plex' && (!form.token ? (
            <div className={`${SETUP_SECTION_CARD_CLASS} flex flex-col gap-4`}>
                <button
                    type="button"
                    onClick={onPlexSignIn}
                    disabled={isLoading}
                    className={`${SETUP_PRIMARY_BUTTON_CLASS} w-full sm:w-auto text-base py-4`}
                >
                    <img src={logoUrl()} alt="" className="w-5 h-5 object-contain" onError={(event) => { event.currentTarget.style.display = 'none'; }} />
                    {isLoading ? 'Redirecting to Plex…' : 'Sign in with Plex'}
                </button>
                <p className="text-xs text-muted leading-relaxed">Uses secure Plex OAuth — we&apos;ll fetch your owned servers automatically. No password stored.</p>
            </div>
        ) : (
            <div className="p-4 sm:p-5 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl flex items-center gap-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
                <div className="w-11 h-11 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center flex-shrink-0">
                    <Check className="w-5 h-5 text-emerald-400" />
                </div>
                <div className="min-w-0 flex-1">
                    <p className="text-emerald-400 font-bold">Signed in as {plexUsername || 'Plex User'}</p>
                    <p className="text-muted text-sm mt-0.5">{servers.length} owned server{servers.length !== 1 ? 's' : ''} found</p>
                </div>
                <button
                    type="button"
                    onClick={onPlexSignOut}
                    className="text-xs font-semibold text-muted hover:text-text px-3 py-1.5 rounded-lg hover:bg-white/5 transition-colors flex-shrink-0"
                >
                    Sign out
                </button>
            </div>
        ))}

        {form.mediaServerType === 'plex' && (servers.length > 0 ? (
            <div className="flex flex-col gap-2.5">
                <label className={SETUP_LABEL_CLASS}>Select Server</label>
                <CustomSelect value={form.serverIdentifier} onChange={(serverIdentifier) => updateForm({ serverIdentifier })} options={servers.map((server) => ({ label: `${server.name} (${server.identifier})`, value: server.identifier }))} />
            </div>
        ) : form.token ? (
            <div className={`${SETUP_SECTION_CARD_CLASS} flex flex-col gap-4`}>
                <div className="flex flex-col gap-2.5">
                    <label className={SETUP_LABEL_CLASS}>Server Identifier</label>
                    <input type="text" className={SETUP_INPUT_CLASS} value={form.serverIdentifier} onChange={(event) => updateForm({ serverIdentifier: event.target.value })} placeholder="No servers returned — enter identifier manually" />
                </div>
                <div className="text-xs text-muted p-4 rounded-xl bg-background/50 border border-white/5 space-y-1.5 leading-relaxed">
                    <p className="font-semibold text-text">How to find Server Identifier manually:</p>
                    <p>1) Open: <code className="bg-background px-1.5 py-0.5 rounded text-plex/90">http://YOUR_PLEX_IP:32400/identity?X-Plex-Token=YOUR_TOKEN</code></p>
                    <p>2) Copy <code className="bg-background px-1.5 py-0.5 rounded">machineIdentifier</code> from the response.</p>
                </div>
            </div>
        ) : null)}

        {form.mediaServerType === 'plex' && (
            <div className="flex flex-col gap-2.5">
                <label className={SETUP_LABEL_CLASS}>
                    Direct Plex URL <span className="text-muted/70 font-normal normal-case tracking-normal">(required in Docker)</span>
                </label>
                <input
                    type="url"
                    className={SETUP_INPUT_CLASS}
                    value={form.plexServerUrl}
                    onChange={(event) => updateForm({ plexServerUrl: event.target.value })}
                    placeholder="http://192.168.1.6:32400"
                />
                <p className="text-xs text-muted leading-relaxed">Your Plex server&apos;s LAN address. Required when Plex.tv discovery fails from inside the container.</p>
            </div>
        )}

        {form.mediaServerType === 'plex' && (
            <IntegrationTestButton
                type="plex"
                payload={{ token: form.token, serverIdentifier: form.serverIdentifier, plexServerUrl: form.plexServerUrl || undefined }}
                disabled={!form.token || !form.serverIdentifier}
            />
        )}

        {form.mediaServerType === 'plex' && (
            <div className="border-t border-white/10 pt-5">
                <button
                    type="button"
                    onClick={() => setShowManualToken(!showManualToken)}
                    className="text-sm font-semibold text-muted hover:text-plex transition-colors"
                >
                    {showManualToken ? '▾ Hide manual token entry' : '▸ Enter Plex token manually'}
                </button>
                {showManualToken && (
                    <div className={`${SETUP_SECTION_CARD_CLASS} mt-4 flex flex-col gap-4`}>
                        <div className="p-4 bg-plex/5 border border-plex/20 rounded-xl text-sm text-muted leading-relaxed">
                            <strong className="text-plex">Tip:</strong> Log into Plex Web, open any library item XML, and find <code className="bg-background px-1.5 py-0.5 rounded">X-Plex-Token=...</code> in the URL.
                        </div>
                        <div className="flex flex-col gap-2.5">
                            <label className={SETUP_LABEL_CLASS}>Plex Token</label>
                            <div className="flex flex-col sm:flex-row gap-2">
                                <input type="password" className={SETUP_INPUT_CLASS} value={form.token} onChange={(event) => updateForm({ token: event.target.value })} placeholder="X-Plex-Token" />
                                <button type="button" onClick={onFetchServers} disabled={isLoading || !form.token} className="px-5 py-3.5 bg-plex/15 text-plex border border-plex/30 rounded-xl font-bold hover:bg-plex/25 whitespace-nowrap transition-colors disabled:opacity-50">
                                    Fetch Servers
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        )}
    </div>
);
