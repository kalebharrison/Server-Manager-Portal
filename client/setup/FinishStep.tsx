import React from 'react';
import { PartyPopper } from 'lucide-react';

import { SETUP_LABEL_CLASS, SETUP_SECTION_CARD_CLASS } from './SetupStepLayout';
import type { SetupWizardForm } from './setupWizardTypes';

export const FinishStep: React.FC<{ stepNumber: number; form: SetupWizardForm }> = ({ stepNumber, form }) => (
    <div className="max-w-lg mx-auto text-center py-4">
        <div className="w-20 h-20 bg-emerald-500/10 rounded-2xl flex items-center justify-center mx-auto mb-6 border border-emerald-500/30 shadow-[0_0_40px_rgba(52,211,153,0.15)]">
            <PartyPopper className="w-10 h-10 text-emerald-400" />
        </div>
        <p className={`${SETUP_LABEL_CLASS} mb-3`}>Step {stepNumber}</p>
        <h2 className="text-3xl sm:text-4xl font-black text-text tracking-tight mb-4">Ready to launch</h2>
        <p className="text-muted text-base leading-relaxed mb-8">
            Your {form.mediaServerType === 'jellyfin' ? 'Jellyfin' : 'Plex'} server{form.sonarrUrl ? ', Sonarr' : ''}{form.radarrUrl ? ', Radarr' : ''}{form.tautulliUrl ? ', Tautulli' : ''}{form.jellystatUrl ? ', Jellystat' : ''} will be saved.
            {form.smtpHost && form.smtpUser && form.smtpPass ? ' Email notifications enabled.' : ' You can add email later in Settings.'}
        </p>
        <div className={`${SETUP_SECTION_CARD_CLASS} text-left text-sm space-y-3`}>
            <p className="flex justify-between gap-4 border-b border-white/5 pb-3"><span className="text-muted">Server</span> <strong className="text-text truncate">{form.mediaServerType === 'jellyfin' ? (form.jellyfinUrl || '—') : (form.serverIdentifier || '—')}</strong></p>
            <p className="flex justify-between gap-4 border-b border-white/5 pb-3"><span className="text-muted">Portal URL</span> <strong className="text-text truncate">{form.publicDomain || '—'}</strong></p>
            <p className="flex justify-between gap-4 items-center"><span className="text-muted">Accent</span> <span className="flex items-center gap-2"><span className="inline-block w-5 h-5 rounded-md border border-white/20 shadow-inner" style={{ backgroundColor: form.primaryColor }} /><strong className="text-text">{form.primaryColor}</strong></span></p>
        </div>
    </div>
);
