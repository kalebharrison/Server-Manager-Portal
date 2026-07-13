import React from 'react';
import { Sparkles } from 'lucide-react';

import { WELCOME_FEATURES } from './setupWizardModel';
import { SETUP_SECTION_CARD_CLASS } from './SetupStepLayout';

export const WelcomeStep: React.FC = () => (
    <div>
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-plex/10 border border-plex/25 text-plex text-[11px] font-bold uppercase tracking-widest mb-5">
            <Sparkles className="w-3.5 h-3.5" /> First-time setup
        </div>
        <h2 className="text-3xl sm:text-4xl font-black text-text tracking-tight mb-3 leading-tight">
            Welcome to your<br className="hidden sm:block" /> media portal
        </h2>
        <p className="text-muted text-base sm:text-lg leading-relaxed mb-8 max-w-xl">
            A guided setup to connect Plex or Jellyfin, brand your portal, and optionally wire up email and your media stack. Takes about five minutes.
        </p>
        <div className="grid sm:grid-cols-2 gap-3 mb-2">
            {WELCOME_FEATURES.map(({ icon: Icon, title, desc }) => (
                <div key={title} className={`${SETUP_SECTION_CARD_CLASS} flex gap-3.5 items-start hover:border-plex/20 transition-colors`}>
                    <div className="w-11 h-11 rounded-xl bg-plex/10 border border-plex/20 flex items-center justify-center flex-shrink-0">
                        <Icon className="w-5 h-5 text-plex" />
                    </div>
                    <div>
                        <p className="font-bold text-text text-sm">{title}</p>
                        <p className="text-xs text-muted mt-1 leading-relaxed">{desc}</p>
                    </div>
                </div>
            ))}
        </div>
    </div>
);
