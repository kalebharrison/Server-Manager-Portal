import React, { Suspense, lazy } from 'react';

import { appConfirm } from '../shared/confirm';
import type { SettingsTabId } from './settingsTabs';

type AddToast = (message: string, type?: 'success' | 'error') => void;
type TabProps = Record<string, any>;

const lazyTab = (loader: () => Promise<{ default: React.ComponentType<any> }>) => (
    lazy(loader) as React.LazyExoticComponent<React.ComponentType<any>>
);

const BackgroundTasksTab = lazyTab(() => import('./BackgroundTasksTab').then(module => ({ default: module.BackgroundTasksTab })));
const BrandingSettingsTab = lazyTab(() => import('./BrandingSettingsTab').then(module => ({ default: module.BrandingSettingsTab })));
const BroadcastTab = lazyTab(() => import('./BroadcastTab').then(module => ({ default: module.BroadcastTab })));
const CleanupSettingsTab = lazyTab(() => import('./CleanupSettingsTab').then(module => ({ default: module.CleanupSettingsTab })));
const ContactSettingsTab = lazyTab(() => import('./ContactSettingsTab').then(module => ({ default: module.ContactSettingsTab })));
const DiscordSettingsTab = lazyTab(() => import('./DiscordSettingsTab').then(module => ({ default: module.DiscordSettingsTab })));
const HomeLayoutSettings = lazyTab(() => import('./HomeLayoutSettings').then(module => ({ default: module.HomeLayoutSettings })));
const InvitesSettings = lazyTab(() => import('./InvitesSettings').then(module => ({ default: module.InvitesSettings })));
const LogsAuditTab = lazyTab(() => import('./LogsAuditTab').then(module => ({ default: module.LogsAuditTab })));
const MediaServerSettingsTab = lazyTab(() => import('./MediaServerSettingsTab').then(module => ({ default: module.MediaServerSettingsTab })));
const MediaStackSettingsTab = lazyTab(() => import('./MediaStackSettingsTab').then(module => ({ default: module.MediaStackSettingsTab })));
const MetadataSettingsTab = lazyTab(() => import('./MetadataSettingsTab').then(module => ({ default: module.MetadataSettingsTab })));
const NavigationOrderTab = lazyTab(() => import('./NavigationOrderTab').then(module => ({ default: module.NavigationOrderTab })));
const NewsletterSettingsTab = lazyTab(() => import('./NewsletterSettingsTab').then(module => ({ default: module.NewsletterSettingsTab })));
const PublicAccessSettingsTab = lazyTab(() => import('./PublicAccessSettingsTab').then(module => ({ default: module.PublicAccessSettingsTab })));
const SmtpSettingsTab = lazyTab(() => import('./SmtpSettingsTab').then(module => ({ default: module.SmtpSettingsTab })));
const UpgraderSettingsPanel = lazyTab(() => import('./UpgraderSettingsPanel').then(module => ({ default: module.UpgraderSettingsPanel })));
const StatusSettingsTab = lazyTab(() => import('./StatusSettingsTab').then(module => ({ default: module.StatusSettingsTab })));
const StreamKillRulesPanel = lazyTab(() => import('./StreamKillRulesPanel').then(module => ({ default: module.StreamKillRulesPanel })));
const SystemSettingsTab = lazyTab(() => import('./SystemSettingsTab').then(module => ({ default: module.SystemSettingsTab })));

const SettingsTabFallback: React.FC = () => (
    <div className="min-h-[240px]" aria-hidden="true" />
);

export type SettingsTabPanelProps = {
    activeTab: SettingsTabId;
    addToast: AddToast;
    streamRulesSaveHandlerRef: React.MutableRefObject<(() => Promise<boolean>) | null>;
    mediaServer: TabProps;
    smtp: TabProps;
    newsletter: TabProps;
    publicAccess: TabProps;
    cleanup: TabProps;
    mediaStack: TabProps;
    metadata: TabProps;
    homeLayout: TabProps;
    navigation: TabProps;
    broadcast: TabProps;
    status: TabProps;
    contact: TabProps;
    discord: TabProps;
    branding: TabProps;
    invites: TabProps;
    tasks: TabProps;
    system: TabProps;
    logs: TabProps;
    upgrader: TabProps;
};

export const SettingsTabPanel: React.FC<SettingsTabPanelProps> = ({
    activeTab,
    addToast,
    streamRulesSaveHandlerRef,
    mediaServer,
    smtp,
    newsletter,
    publicAccess,
    cleanup,
    mediaStack,
    metadata,
    homeLayout,
    navigation,
    broadcast,
    status,
    contact,
    discord,
    branding,
    invites,
    tasks,
    system,
    logs,
    upgrader,
}) => (
    <Suspense fallback={<SettingsTabFallback />}>
        {activeTab === 'stream-rules' && (
            <StreamKillRulesPanel
                addToast={addToast}
                registerSaveHandler={(handler: (() => Promise<boolean>) | null) => {
                    streamRulesSaveHandlerRef.current = handler;
                }}
            />
        )}

        {activeTab === 'plex' && <MediaServerSettingsTab {...mediaServer} />}
        {activeTab === 'smtp' && <SmtpSettingsTab {...smtp} />}
        {activeTab === 'newsletter' && <NewsletterSettingsTab {...newsletter} />}
        {activeTab === 'public-access' && <PublicAccessSettingsTab {...publicAccess} />}
        {activeTab === 'cleanup' && <CleanupSettingsTab {...cleanup} />}
        {activeTab === 'mediastack' && <MediaStackSettingsTab {...mediaStack} />}
        {activeTab === 'upgrader' && <UpgraderSettingsPanel {...upgrader} />}
        {activeTab === 'metadata' && <MetadataSettingsTab {...metadata} />}
        {activeTab === 'home-layout' && <HomeLayoutSettings {...homeLayout} />}
        {activeTab === 'navigation' && <NavigationOrderTab {...navigation} />}
        {activeTab === 'broadcast' && <BroadcastTab {...broadcast} />}
        {activeTab === 'status' && <StatusSettingsTab {...status} appConfirm={appConfirm} addToast={addToast} />}
        {activeTab === 'contact' && <ContactSettingsTab {...contact} />}
        {activeTab === 'discord' && <DiscordSettingsTab {...discord} />}
        {activeTab === 'branding' && <BrandingSettingsTab {...branding} />}
        {activeTab === 'invites' && <InvitesSettings {...invites} />}
        {activeTab === 'tasks' && <BackgroundTasksTab {...tasks} />}
        {activeTab === 'system' && <SystemSettingsTab {...system} />}
        {activeTab === 'logs' && <LogsAuditTab {...logs} />}
    </Suspense>
);
