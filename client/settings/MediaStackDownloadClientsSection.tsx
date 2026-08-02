import React from 'react';

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
    const sabConfigured = !!(String(qcSabUrl || '').trim() && String(qcSabApiKey || '').trim());
    const subtitle = [
        qbitConfigured ? 'qBittorrent' : null,
        sabConfigured ? 'SABnzbd' : null,
    ].filter(Boolean).join(' · ') || 'Not configured';

    return (
        <SettingsCollapseSection
            title="Download clients"
            subtitle={subtitle}
        >
            <p className="text-sm text-muted mb-4">
                Used by Quality Control for queue health, orphan cleanup, and blocked-extension sync.
                Behavior (thresholds, automation, extension lists) stays under Settings → Quality Control.
            </p>
            <div id="download-clients" className="space-y-4 scroll-mt-24">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label htmlFor="qcQbitUrl">qBittorrent URL</label>
                        <input
                            id="qcQbitUrl"
                            type="url"
                            className="w-full p-3 rounded-lg border border-border bg-background text-text outline-none focus:border-plex focus:ring-1 focus:ring-plex transition-all"
                            value={qcQbitUrl}
                            placeholder="http://192.168.1.10:8080"
                            onChange={(event) => onQcQbitUrlChange(event.target.value)}
                        />
                    </div>
                    <div>
                        <label htmlFor="qcQbitUsername">qBittorrent username</label>
                        <input
                            id="qcQbitUsername"
                            type="text"
                            className="w-full p-3 rounded-lg border border-border bg-background text-text outline-none focus:border-plex focus:ring-1 focus:ring-plex transition-all"
                            value={qcQbitUsername}
                            autoComplete="off"
                            onChange={(event) => onQcQbitUsernameChange(event.target.value)}
                        />
                    </div>
                    <div className="md:col-span-2">
                        <label htmlFor="qcQbitPassword">qBittorrent password</label>
                        <input
                            id="qcQbitPassword"
                            type="password"
                            className="w-full p-3 rounded-lg border border-border bg-background text-text outline-none focus:border-plex focus:ring-1 focus:ring-plex transition-all"
                            value={qcQbitPassword}
                            placeholder="••••••••"
                            autoComplete="off"
                            onChange={(event) => onQcQbitPasswordChange(event.target.value)}
                        />
                    </div>
                    <div>
                        <label htmlFor="qcSabUrl">SABnzbd URL</label>
                        <input
                            id="qcSabUrl"
                            type="url"
                            className="w-full p-3 rounded-lg border border-border bg-background text-text outline-none focus:border-plex focus:ring-1 focus:ring-plex transition-all"
                            value={qcSabUrl}
                            placeholder="http://192.168.1.10:8085"
                            onChange={(event) => onQcSabUrlChange(event.target.value)}
                        />
                    </div>
                    <div>
                        <label htmlFor="qcSabApiKey">SABnzbd API key</label>
                        <input
                            id="qcSabApiKey"
                            type="password"
                            className="w-full p-3 rounded-lg border border-border bg-background text-text outline-none focus:border-plex focus:ring-1 focus:ring-plex transition-all"
                            value={qcSabApiKey}
                            placeholder="••••••••"
                            autoComplete="off"
                            onChange={(event) => onQcSabApiKeyChange(event.target.value)}
                        />
                    </div>
                </div>
            </div>
        </SettingsCollapseSection>
    );
};
