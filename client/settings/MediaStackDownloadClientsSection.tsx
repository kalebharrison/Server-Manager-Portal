import React from 'react';

import { IntegrationTitle, hasIntegrationCredentials } from './integrationDisplay';
import { SettingsCollapseSection } from './SettingsCollapseSection';

type Props = {
    qcQbitUrl: string;
    qcQbitUsername: string;
    qcQbitPassword: string;
    qcSabUrl: string;
    qcSabApiKey: string;
    onQcQbitUrlChange: (value: string) => void;
    onQcQbitUsernameChange: (value: string) => void;
    onQcQbitPasswordChange: (value: string) => void;
    onQcSabUrlChange: (value: string) => void;
    onQcSabApiKeyChange: (value: string) => void;
};

const fieldClass = 'w-full p-3 rounded-lg border border-border bg-background text-text outline-none focus:border-plex focus:ring-1 focus:ring-plex transition-all';

export const MediaStackDownloadClientsSection: React.FC<Props> = ({
    qcQbitUrl,
    qcQbitUsername,
    qcQbitPassword,
    qcSabUrl,
    qcSabApiKey,
    onQcQbitUrlChange,
    onQcQbitUsernameChange,
    onQcQbitPasswordChange,
    onQcSabUrlChange,
    onQcSabApiKeyChange,
}) => {
    const qbitConfigured = !!String(qcQbitUrl || '').trim();
    const sabConfigured = hasIntegrationCredentials(qcSabUrl, qcSabApiKey);

    return (
        <>
            <SettingsCollapseSection
                title={<IntegrationTitle app="qbittorrent" title="qBittorrent" subtitle="Torrent client for Quality Control health and cleanup" />}
                subtitle={qbitConfigured ? 'Configured' : 'Not configured'}
            >
                <div id="qbittorrent" className="space-y-4 scroll-mt-24">
                    <div>
                        <label htmlFor="qcQbitUrl">URL</label>
                        <input
                            id="qcQbitUrl"
                            type="url"
                            className={fieldClass}
                            value={qcQbitUrl}
                            placeholder="http://qbittorrent:8080"
                            onChange={(event) => onQcQbitUrlChange(event.target.value)}
                        />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label htmlFor="qcQbitUsername">Username</label>
                            <input
                                id="qcQbitUsername"
                                type="text"
                                className={fieldClass}
                                value={qcQbitUsername}
                                autoComplete="off"
                                onChange={(event) => onQcQbitUsernameChange(event.target.value)}
                            />
                        </div>
                        <div>
                            <label htmlFor="qcQbitPassword">Password</label>
                            <input
                                id="qcQbitPassword"
                                type="password"
                                className={fieldClass}
                                value={qcQbitPassword}
                                placeholder="••••••••"
                                autoComplete="off"
                                onChange={(event) => onQcQbitPasswordChange(event.target.value)}
                            />
                        </div>
                    </div>
                </div>
            </SettingsCollapseSection>

            <SettingsCollapseSection
                title={<IntegrationTitle app="sabnzbd" title="SABnzbd" subtitle="Usenet client for Quality Control health and cleanup" />}
                subtitle={sabConfigured ? 'Configured' : 'Not configured'}
            >
                <div id="sabnzbd" className="space-y-4 scroll-mt-24">
                    <div>
                        <label htmlFor="qcSabUrl">URL</label>
                        <input
                            id="qcSabUrl"
                            type="url"
                            className={fieldClass}
                            value={qcSabUrl}
                            placeholder="http://sabnzbd:8080"
                            onChange={(event) => onQcSabUrlChange(event.target.value)}
                        />
                    </div>
                    <div>
                        <label htmlFor="qcSabApiKey">API key</label>
                        <input
                            id="qcSabApiKey"
                            type="password"
                            className={fieldClass}
                            value={qcSabApiKey}
                            placeholder="••••••••"
                            autoComplete="off"
                            onChange={(event) => onQcSabApiKeyChange(event.target.value)}
                        />
                    </div>
                </div>
            </SettingsCollapseSection>
        </>
    );
};
