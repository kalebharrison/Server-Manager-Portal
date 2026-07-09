import React from 'react';

import { CustomSelect } from '../shared/ui';
import { SettingHint } from './SettingHint';

type NewsletterSettingsTabProps = {
    newsletterFrequency: string;
    newsletterDay: number;
    publicDomain: string;
    isTestingNewsletter: boolean;
    isSendingNewsletter: boolean;
    onNewsletterFrequencyChange: (value: string) => void;
    onNewsletterDayChange: (value: number) => void;
    onPublicDomainChange: (value: string) => void;
    onTestNewsletter: () => void;
    onSendNewsletterNow: () => void;
};

export const NewsletterSettingsTab: React.FC<NewsletterSettingsTabProps> = ({
    newsletterFrequency,
    newsletterDay,
    publicDomain,
    isTestingNewsletter,
    isSendingNewsletter,
    onNewsletterFrequencyChange,
    onNewsletterDayChange,
    onPublicDomainChange,
    onTestNewsletter,
    onSendNewsletterNow,
}) => (
    <div className="mb-8">
        <h3 className="text-xl font-bold text-plex mb-4 border-b border-border pb-2">Automated Newsletter</h3>
        <div className="mb-4">
            <label htmlFor="newsletterFrequency">Frequency</label>
            <CustomSelect
                id="newsletterFrequency"
                value={newsletterFrequency}
                onChange={onNewsletterFrequencyChange}
                options={[
                    { label: 'Disabled', value: 'disabled' },
                    { label: 'Weekly', value: 'weekly' },
                    { label: 'Monthly', value: 'monthly' }
                ]}
            />
            <div className="mt-2">
                <SettingHint>How often should users receive the newsletter.</SettingHint>
            </div>
        </div>
        {newsletterFrequency !== 'disabled' && (
            <>
                <div className="mb-4" style={{ marginTop: '1rem' }}>
                    <label htmlFor="newsletterDay">Send Day</label>
                    {newsletterFrequency === 'weekly' ? (
                        <CustomSelect
                            id="newsletterDay"
                            value={newsletterDay}
                            onChange={val => onNewsletterDayChange(Number(val))}
                            options={[
                                { label: 'Sunday', value: 0 },
                                { label: 'Monday', value: 1 },
                                { label: 'Tuesday', value: 2 },
                                { label: 'Wednesday', value: 3 },
                                { label: 'Thursday', value: 4 },
                                { label: 'Friday', value: 5 },
                                { label: 'Saturday', value: 6 }
                            ]}
                        />
                    ) : (
                        <input className="w-full p-3 rounded-lg border border-border bg-background text-text outline-none focus:border-plex focus:ring-1 focus:ring-plex transition-all" id="newsletterDay" type="number" min="1" max="28" value={newsletterDay} onChange={e => onNewsletterDayChange(Number(e.target.value))} placeholder="Day of the month (1-28)" />
                    )}
                </div>
                <div className="mb-4" style={{ marginTop: '1rem' }}>
                    <label htmlFor="publicDomain">Public Domain</label>
                    <input className="w-full p-3 rounded-lg border border-border bg-background text-text outline-none focus:border-plex focus:ring-1 focus:ring-plex transition-all" id="publicDomain" type="text" value={publicDomain} onChange={e => onPublicDomainChange(e.target.value)} placeholder="https://portal.yourdomain.com" />
                    <div className="mt-2">
                        <SettingHint>Your public URL. This is required to host the posters inside the email.</SettingHint>
                    </div>
                </div>
            </>
        )}
        <div className="mt-6 space-y-3">
            <h4 className="font-bold text-text">Test Newsletter</h4>
            <div className="flex flex-col md:flex-row gap-4 mb-4">
                <button className="px-4 py-2 bg-border text-text rounded-md font-medium hover:bg-opacity-80 transition-colors flex items-center justify-center gap-2" onClick={onTestNewsletter} disabled={isTestingNewsletter || isSendingNewsletter}>
                    {isTestingNewsletter ? 'Generating & Sending...' : 'Send Test Newsletter To Admin'}
                </button>
                <button className="px-4 py-2 bg-plex text-background rounded-md font-medium hover:bg-plex-hover transition-colors flex items-center justify-center gap-2" onClick={onSendNewsletterNow} disabled={isTestingNewsletter || isSendingNewsletter}>
                    {isSendingNewsletter ? 'Sending To All...' : 'Send Newsletter To ALL NOW'}
                </button>
            </div>
        </div>
    </div>
);
