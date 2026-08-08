import { useCallback, useState } from 'react';

import { apiFetch } from '../shared/api';
import { portalUrl } from '../shared/basePath';
import { appConfirm } from '../shared/confirm';

type AddToast = (message: string, type?: 'success' | 'error') => void;

type UseSettingsEmailActionsOptions = {
    addToast: AddToast;
    smtpHost: string;
    smtpPort: number;
    smtpUser: string;
    smtpPass: string;
    smtpFrom: string;
    smtpSecure: boolean;
    inboundRepliesEnabled: boolean;
    inboundReplyDomain: string;
    testRecipient: string;
};

export const useSettingsEmailActions = ({
    addToast,
    smtpHost,
    smtpPort,
    smtpUser,
    smtpPass,
    smtpFrom,
    smtpSecure,
    inboundRepliesEnabled,
    inboundReplyDomain,
    testRecipient,
}: UseSettingsEmailActionsOptions) => {
    const [isTestingSmtp, setIsTestingSmtp] = useState(false);
    const [isSendingAllMocks, setIsSendingAllMocks] = useState(false);
    const [isTestingNewsletter, setIsTestingNewsletter] = useState(false);
    const [isSendingNewsletter, setIsSendingNewsletter] = useState(false);

    const handleTestEmail = useCallback(async () => {
        if (!smtpHost || !smtpUser || !smtpPass || !testRecipient) {
            addToast('Please fill out SMTP Host, User, Password, and Test Recipient.', 'error');
            return;
        }
        setIsTestingSmtp(true);
        try {
            const result = await apiFetch('/api/config/test-email', {
                method: 'POST',
                body: JSON.stringify({
                    smtpHost,
                    smtpPort,
                    smtpUser,
                    smtpPass,
                    smtpFrom,
                    smtpSecure,
                    inboundRepliesEnabled,
                    inboundReplyDomain,
                    testRecipient,
                }),
            });
            addToast(result.message || 'Test email sent successfully!', 'success');
        } catch (error) {
            addToast(error instanceof Error ? error.message : 'SMTP test failed.', 'error');
        } finally {
            setIsTestingSmtp(false);
        }
    }, [addToast, smtpHost, smtpPort, smtpUser, smtpPass, smtpFrom, smtpSecure, inboundRepliesEnabled, inboundReplyDomain, testRecipient]);

    const handleSendAllMockEmails = useCallback(async () => {
        if (!smtpHost || !smtpUser || !smtpPass || !testRecipient) {
            addToast('Please fill out SMTP Host, User, Password, and Test Recipient.', 'error');
            return;
        }
        setIsSendingAllMocks(true);
        try {
            const result = await apiFetch('/api/config/test-all-emails', {
                method: 'POST',
                body: JSON.stringify({
                    smtpHost,
                    smtpPort,
                    smtpUser,
                    smtpPass,
                    smtpFrom,
                    smtpSecure,
                    inboundRepliesEnabled,
                    inboundReplyDomain,
                    testRecipient,
                }),
            });
            addToast(result.message || 'Mock emails sent.', 'success');
        } catch (error) {
            addToast(error instanceof Error ? error.message : 'Mock email sweep failed.', 'error');
        } finally {
            setIsSendingAllMocks(false);
        }
    }, [addToast, smtpHost, smtpPort, smtpUser, smtpPass, smtpFrom, smtpSecure, inboundRepliesEnabled, inboundReplyDomain, testRecipient]);

    const handlePreviewEmails = useCallback(() => {
        window.open(portalUrl('/api/config/email-previews'), '_blank', 'noopener,noreferrer');
    }, []);

    const handleTestNewsletter = useCallback(async () => {
        setIsTestingNewsletter(true);
        try {
            const result = await apiFetch('/api/newsletter/test', { method: 'POST' });
            addToast(result.message || 'Newsletter sent successfully!', 'success');
        } catch (error) {
            addToast(error instanceof Error ? error.message : 'Newsletter test failed.', 'error');
        } finally {
            setIsTestingNewsletter(false);
        }
    }, [addToast]);

    const handleSendNewsletterNow = useCallback(async () => {
        appConfirm('Are you sure you want to send the newsletter to ALL configured users immediately? This cannot be undone.', async () => {
            setIsSendingNewsletter(true);
            try {
                const result = await apiFetch('/api/newsletter/send-now', { method: 'POST' });
                addToast(result.message || 'Newsletter dispatch initiated!', 'success');
            } catch (error) {
                addToast(error instanceof Error ? error.message : 'Newsletter dispatch failed.', 'error');
            } finally {
                setIsSendingNewsletter(false);
            }
        });
    }, [addToast]);

    return {
        isTestingSmtp,
        isSendingAllMocks,
        isTestingNewsletter,
        isSendingNewsletter,
        handleTestEmail,
        handleSendAllMockEmails,
        handlePreviewEmails,
        handleTestNewsletter,
        handleSendNewsletterNow,
    };
};
