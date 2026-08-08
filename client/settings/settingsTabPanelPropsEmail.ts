import type { SettingsTabPanelProps } from './SettingsTabPanel';
import type { SettingsFormValues } from './useSettingsFormState';
import type { useSettingsEmailActions } from './useSettingsEmailActions';
import type { SettingsTabPanelOnChange } from './settingsTabPanelPropsTypes';

type EmailTabPanelPropsInput = {
    values: SettingsFormValues;
    onChange: SettingsTabPanelOnChange;
    emailActions: ReturnType<typeof useSettingsEmailActions>;
};

export const buildSmtpTabPanelProps = ({
    values,
    onChange,
    emailActions,
}: EmailTabPanelPropsInput): SettingsTabPanelProps['smtp'] => ({
    smtpEnabled: values.smtpEnabled,
    smtpHost: values.smtpHost,
    smtpPort: values.smtpPort,
    smtpUser: values.smtpUser,
    smtpPass: values.smtpPass,
    smtpFrom: values.smtpFrom,
    smtpSecure: values.smtpSecure,
    emailDaysBefore: values.emailDaysBefore,
    testRecipient: values.testRecipient,
    isTestingSmtp: emailActions.isTestingSmtp,
    onSmtpEnabledChange: onChange('smtpEnabled'),
    onSmtpHostChange: onChange('smtpHost'),
    onSmtpPortChange: onChange('smtpPort'),
    onSmtpUserChange: onChange('smtpUser'),
    onSmtpPassChange: onChange('smtpPass'),
    onSmtpFromChange: onChange('smtpFrom'),
    onSmtpSecureChange: onChange('smtpSecure'),
    onEmailDaysBeforeChange: onChange('emailDaysBefore'),
    onTestRecipientChange: onChange('testRecipient'),
    onTestEmail: emailActions.handleTestEmail,
});

export const buildNewsletterTabPanelProps = ({
    values,
    onChange,
    emailActions,
}: EmailTabPanelPropsInput): SettingsTabPanelProps['newsletter'] => ({
    newsletterFrequency: values.newsletterFrequency,
    newsletterDay: values.newsletterDay,
    publicDomain: values.publicDomain,
    isTestingNewsletter: emailActions.isTestingNewsletter,
    isSendingNewsletter: emailActions.isSendingNewsletter,
    onNewsletterFrequencyChange: onChange('newsletterFrequency'),
    onNewsletterDayChange: onChange('newsletterDay'),
    onPublicDomainChange: onChange('publicDomain'),
    onTestNewsletter: emailActions.handleTestNewsletter,
    onSendNewsletterNow: emailActions.handleSendNewsletterNow,
});

export const buildCleanupTabPanelProps = ({
    values,
    onChange,
}: Pick<EmailTabPanelPropsInput, 'values' | 'onChange'>): SettingsTabPanelProps['cleanup'] => ({
    inactiveCleanupEnabled: values.inactiveCleanupEnabled,
    inactiveCleanupDays: values.inactiveCleanupDays,
    onInactiveCleanupEnabledChange: onChange('inactiveCleanupEnabled'),
    onInactiveCleanupDaysChange: onChange('inactiveCleanupDays'),
});
