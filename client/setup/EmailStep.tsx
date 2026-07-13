import React from 'react';

import {
    SETUP_INPUT_CLASS,
    SETUP_LABEL_CLASS,
    SETUP_SECTION_CARD_CLASS,
    SetupStepHeader,
} from './SetupStepLayout';
import type { SetupWizardForm, UpdateSetupWizardForm } from './setupWizardTypes';

export const EmailStep: React.FC<{
    stepNumber: number;
    form: SetupWizardForm;
    updateForm: UpdateSetupWizardForm;
    testRecipient: string;
    setTestRecipient: (recipient: string) => void;
    isLoading: boolean;
    onTestEmail: () => void;
}> = ({ stepNumber, form, updateForm, testRecipient, setTestRecipient, isLoading, onTestEmail }) => (
    <div className="flex flex-col gap-6 max-w-2xl">
        <SetupStepHeader
            stepNumber={stepNumber}
            title="Email Notifications"
            description="Optional — send expiry reminders and newsletters. Skip if you'll configure later."
        />
        <div className={`${SETUP_SECTION_CARD_CLASS} grid grid-cols-1 md:grid-cols-2 gap-5`}>
            <div className="flex flex-col gap-2.5 md:col-span-2">
                <label className={SETUP_LABEL_CLASS}>SMTP Host</label>
                <input type="text" className={SETUP_INPUT_CLASS} value={form.smtpHost} onChange={(event) => updateForm({ smtpHost: event.target.value })} placeholder="smtp.mailgun.org" />
            </div>
            <div className="flex flex-col gap-2.5">
                <label className={SETUP_LABEL_CLASS}>Port</label>
                <input type="number" className={SETUP_INPUT_CLASS} value={form.smtpPort} onChange={(event) => updateForm({ smtpPort: Number(event.target.value) })} />
            </div>
            <div className="flex flex-col gap-2.5">
                <label className={SETUP_LABEL_CLASS}>Secure (TLS)</label>
                <label className="flex items-center gap-3 cursor-pointer mt-1 p-3.5 rounded-xl bg-background/50 border border-white/5">
                    <input type="checkbox" checked={form.smtpSecure} onChange={(event) => updateForm({ smtpSecure: event.target.checked })} className="w-4 h-4 accent-plex" />
                    <span className="text-sm text-text font-medium">Use SSL/TLS</span>
                </label>
            </div>
            <div className="flex flex-col gap-2.5">
                <label className={SETUP_LABEL_CLASS}>SMTP User</label>
                <input type="text" className={SETUP_INPUT_CLASS} value={form.smtpUser} onChange={(event) => updateForm({ smtpUser: event.target.value })} />
            </div>
            <div className="flex flex-col gap-2.5">
                <label className={SETUP_LABEL_CLASS}>SMTP Password</label>
                <input type="password" className={SETUP_INPUT_CLASS} value={form.smtpPass} onChange={(event) => updateForm({ smtpPass: event.target.value })} />
            </div>
            <div className="flex flex-col gap-2.5 md:col-span-2">
                <label className={SETUP_LABEL_CLASS}>From Address</label>
                <input type="text" className={SETUP_INPUT_CLASS} value={form.smtpFrom} onChange={(event) => updateForm({ smtpFrom: event.target.value })} placeholder="Plex Server &lt;noreply@domain.com&gt;" />
            </div>
        </div>
        {form.smtpHost && form.smtpUser && form.smtpPass && (
            <div className={`${SETUP_SECTION_CARD_CLASS} flex flex-col gap-3`}>
                <label className={SETUP_LABEL_CLASS}>Send Test Email</label>
                <div className="flex flex-col sm:flex-row gap-2">
                    <input type="email" className={SETUP_INPUT_CLASS} value={testRecipient} onChange={(event) => setTestRecipient(event.target.value)} placeholder="you@example.com" />
                    <button type="button" onClick={onTestEmail} disabled={isLoading} className="px-5 py-3.5 bg-white/5 border border-white/10 text-text rounded-xl font-bold hover:bg-white/10 whitespace-nowrap transition-colors disabled:opacity-50">
                        Send Test
                    </button>
                </div>
            </div>
        )}
    </div>
);
