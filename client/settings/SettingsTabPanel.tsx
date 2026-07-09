import React from 'react';

import { appConfirm } from '../shared/confirm';
import { BackgroundTasksTab } from './BackgroundTasksTab';
import { BrandingSettingsTab } from './BrandingSettingsTab';
import { BroadcastTab } from './BroadcastTab';
import { CleanupSettingsTab } from './CleanupSettingsTab';
import { ContactSettingsTab } from './ContactSettingsTab';
import { HomeLayoutSettings } from './HomeLayoutSettings';
import { InvitesSettings } from './InvitesSettings';
import { LogsAuditTab } from './LogsAuditTab';
import { MediaServerSettingsTab } from './MediaServerSettingsTab';
import { MediaStackSettingsTab } from './MediaStackSettingsTab';
import { NavigationOrderTab } from './NavigationOrderTab';
import { NewsletterSettingsTab } from './NewsletterSettingsTab';
import { SmtpSettingsTab } from './SmtpSettingsTab';
import { StatusSettingsTab } from './StatusSettingsTab';
import { StreamKillRulesPanel } from './StreamKillRulesPanel';
import { SystemSettingsTab } from './SystemSettingsTab';
import type { SettingsTabId } from './settingsTabs';

type AddToast = (message: string, type?: 'success' | 'error') => void;

export type SettingsTabPanelProps = {
    activeTab: SettingsTabId;
    addToast: AddToast;
    streamRulesSaveHandlerRef: React.MutableRefObject<(() => Promise<boolean>) | null>;
    mediaServer: React.ComponentProps<typeof MediaServerSettingsTab>;
    smtp: React.ComponentProps<typeof SmtpSettingsTab>;
    newsletter: React.ComponentProps<typeof NewsletterSettingsTab>;
    cleanup: React.ComponentProps<typeof CleanupSettingsTab>;
    mediaStack: React.ComponentProps<typeof MediaStackSettingsTab>;
    homeLayout: React.ComponentProps<typeof HomeLayoutSettings>;
    navigation: React.ComponentProps<typeof NavigationOrderTab>;
    broadcast: React.ComponentProps<typeof BroadcastTab>;
    status: Omit<React.ComponentProps<typeof StatusSettingsTab>, 'appConfirm' | 'addToast'>;
    contact: React.ComponentProps<typeof ContactSettingsTab>;
    branding: React.ComponentProps<typeof BrandingSettingsTab>;
    invites: React.ComponentProps<typeof InvitesSettings>;
    tasks: React.ComponentProps<typeof BackgroundTasksTab>;
    system: React.ComponentProps<typeof SystemSettingsTab>;
    logs: React.ComponentProps<typeof LogsAuditTab>;
};

export const SettingsTabPanel: React.FC<SettingsTabPanelProps> = ({
    activeTab,
    addToast,
    streamRulesSaveHandlerRef,
    mediaServer,
    smtp,
    newsletter,
    cleanup,
    mediaStack,
    homeLayout,
    navigation,
    broadcast,
    status,
    contact,
    branding,
    invites,
    tasks,
    system,
    logs,
}) => (
    <>
        {activeTab === 'stream-rules' && (
            <StreamKillRulesPanel
                addToast={addToast}
                registerSaveHandler={(handler) => {
                    streamRulesSaveHandlerRef.current = handler;
                }}
            />
        )}

        {activeTab === 'plex' && <MediaServerSettingsTab {...mediaServer} />}
        {activeTab === 'smtp' && <SmtpSettingsTab {...smtp} />}
        {activeTab === 'newsletter' && <NewsletterSettingsTab {...newsletter} />}
        {activeTab === 'cleanup' && <CleanupSettingsTab {...cleanup} />}
        {activeTab === 'mediastack' && <MediaStackSettingsTab {...mediaStack} />}
        {activeTab === 'home-layout' && <HomeLayoutSettings {...homeLayout} />}
        {activeTab === 'navigation' && <NavigationOrderTab {...navigation} />}
        {activeTab === 'broadcast' && <BroadcastTab {...broadcast} />}
        {activeTab === 'status' && <StatusSettingsTab {...status} appConfirm={appConfirm} addToast={addToast} />}
        {activeTab === 'contact' && <ContactSettingsTab {...contact} />}
        {activeTab === 'branding' && <BrandingSettingsTab {...branding} />}
        {activeTab === 'invites' && <InvitesSettings {...invites} />}
        {activeTab === 'tasks' && <BackgroundTasksTab {...tasks} />}
        {activeTab === 'system' && <SystemSettingsTab {...system} />}
        {activeTab === 'logs' && <LogsAuditTab {...logs} />}
    </>
);
