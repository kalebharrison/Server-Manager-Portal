import {
    buildLogsTabPanelProps,
    buildSystemTabPanelProps,
    buildTasksTabPanelProps,
} from './settingsTabPanelPropsAdmin';
import {
    buildBrandingTabPanelProps,
    buildBroadcastTabPanelProps,
    buildContactTabPanelProps,
    buildDiscordTabPanelProps,
    buildHomeLayoutTabPanelProps,
    buildInvitesTabPanelProps,
    buildNavigationTabPanelProps,
    buildPublicAccessTabPanelProps,
    buildScannerTabPanelProps,
    buildUpgraderTabPanelProps,
    buildStatusTabPanelProps,
} from './settingsTabPanelPropsContent';
import {
    buildCleanupTabPanelProps,
    buildNewsletterTabPanelProps,
    buildSmtpTabPanelProps,
} from './settingsTabPanelPropsEmail';
import {
    buildMediaServerTabPanelProps,
    buildMediaStackTabPanelProps,
    buildMetadataTabPanelProps,
} from './settingsTabPanelPropsMedia';
import type { SettingsTabPanelProps } from './SettingsTabPanel';
import {
    createSettingsTabPanelOnChange,
    type SettingsTabPanelPropsInput,
} from './settingsTabPanelPropsTypes';

export const buildSettingsTabPanelProps = ({
    addToast,
    streamRulesSaveHandlerRef,
    initialSettings,
    form,
    tabs,
    resources,
    emailActions,
    admin,
    handleFetchServers,
    setStatusDraft,
    handlePushAnnouncement,
    isPushingAnnouncement,
}: SettingsTabPanelPropsInput): SettingsTabPanelProps => {
    const { values } = form;
    const onChange = createSettingsTabPanelOnChange(form);

    return {
        activeTab: tabs.activeTab,
        addToast,
        streamRulesSaveHandlerRef,
        mediaServer: buildMediaServerTabPanelProps({
            initialSettings,
            values,
            onChange,
            handleFetchServers,
            addToast,
        }),
        smtp: buildSmtpTabPanelProps({ values, onChange, emailActions }),
        newsletter: buildNewsletterTabPanelProps({ values, onChange, emailActions }),
        cleanup: buildCleanupTabPanelProps({ values, onChange }),
        mediaStack: buildMediaStackTabPanelProps({ initialSettings, values, onChange, addToast }),
        scanner: buildScannerTabPanelProps({ values, onChange, addToast }),
        upgrader: buildUpgraderTabPanelProps({ values, onChange }),
        metadata: buildMetadataTabPanelProps({ initialSettings, values, onChange, addToast }),
        homeLayout: buildHomeLayoutTabPanelProps({ values, form }),
        navigation: buildNavigationTabPanelProps({ values, onChange }),
        broadcast: buildBroadcastTabPanelProps({ resources }),
        status: buildStatusTabPanelProps({ values, onChange, resources, setStatusDraft }),
        contact: buildContactTabPanelProps({ values, onChange, handlePushAnnouncement, isPushingAnnouncement }),
        discord: buildDiscordTabPanelProps({ values, onChange }),
        publicAccess: buildPublicAccessTabPanelProps({ values, onChange, resources }),
        branding: buildBrandingTabPanelProps({ values, onChange, addToast }),
        invites: buildInvitesTabPanelProps({ addToast }),
        tasks: buildTasksTabPanelProps({ admin }),
        system: buildSystemTabPanelProps({ values, admin }),
        logs: buildLogsTabPanelProps({ admin }),
    };
};
