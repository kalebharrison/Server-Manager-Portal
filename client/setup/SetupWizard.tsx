import React from 'react';
import { Check, ChevronLeft, ChevronRight, Settings } from 'lucide-react';

import { AuthPageBackground } from '../shared/theme';
import { BrandingStep } from './BrandingStep';
import { EmailStep } from './EmailStep';
import { FinishStep } from './FinishStep';
import { IntegrationsStep } from './IntegrationsStep';
import { MediaServerStep } from './MediaServerStep';
import { SETUP_PRIMARY_BUTTON_CLASS } from './SetupStepLayout';
import { SetupStepNavigation } from './SetupStepNavigation';
import { STEPS } from './setupWizardModel';
import { useSetupWizard } from './useSetupWizard';
import { WelcomeStep } from './WelcomeStep';

export const SetupWizard: React.FC<{ onComplete: () => void }> = ({ onComplete }) => {
    const wizard = useSetupWizard(onComplete);
    const {
        step,
        stepIndex,
        form,
        updateForm,
        servers,
        plexUsername,
        showManualToken,
        setShowManualToken,
        testRecipient,
        setTestRecipient,
        integrationTab,
        setIntegrationTab,
        error,
        isLoading,
        canGoNext,
        applyBrandTheme,
        applyMediaServerType,
        handlePlexSignIn,
        handleFetchServers,
        handlePlexSignOut,
        handleTestEmail,
        handleComplete,
        goNext,
        goBack,
    } = wizard;
    const stepNumber = stepIndex + 1;
    const progressPct = Math.round((stepNumber / STEPS.length) * 100);

    return (
        <div className="relative min-h-screen w-full flex items-center justify-center p-4 sm:p-6 md:p-8 lg:p-10 overflow-hidden">
            <AuthPageBackground />

            <div className="relative z-10 w-full max-w-6xl">
                <div className="glass-card-lg overflow-hidden flex flex-col lg:flex-row min-h-[min(720px,calc(100vh-3rem))]">
                    <aside className="hidden lg:flex flex-col w-[320px] xl:w-[360px] flex-shrink-0 border-r border-white/10 bg-gradient-to-b from-plex/[0.08] via-plex/[0.03] to-transparent p-8">
                        <div className="mb-8">
                            <div className="w-12 h-12 rounded-2xl bg-plex/15 border border-plex/30 flex items-center justify-center mb-4 shadow-[0_0_30px_rgba(229,160,13,0.2)]">
                                <Settings className="w-6 h-6 text-plex" />
                            </div>
                            <h1 className="text-xl font-black text-text tracking-tight leading-tight">Server Manager Portal</h1>
                            <p className="text-[11px] font-bold text-muted uppercase tracking-[0.2em] mt-2">Initial Setup</p>
                        </div>

                        <nav className="flex-1 space-y-1.5">
                            <SetupStepNavigation step={step} stepIndex={stepIndex} />
                        </nav>

                        <div className="mt-8 pt-6 border-t border-white/10">
                            <div className="flex justify-between text-xs font-semibold text-muted mb-2.5">
                                <span>Setup progress</span>
                                <span className="text-plex">{progressPct}%</span>
                            </div>
                            <div className="h-2 bg-white/5 rounded-full overflow-hidden border border-white/5">
                                <div
                                    className="h-full bg-gradient-to-r from-plex via-plex-hover to-plex rounded-full transition-all duration-500 ease-out shadow-plex/20 shadow-lg"
                                    style={{ width: `${progressPct}%` }}
                                />
                            </div>
                            <p className="text-[11px] text-muted/70 mt-3">Step {stepNumber} of {STEPS.length}</p>
                        </div>
                    </aside>

                    <div className="flex-1 flex flex-col min-h-0 min-w-0">
                        <div className="lg:hidden border-b border-white/10 bg-black/20 px-4 py-4 overflow-x-auto">
                            <div className="flex items-center gap-2 min-w-max">
                                <SetupStepNavigation step={step} stepIndex={stepIndex} compact />
                            </div>
                            <div className="mt-3 h-1.5 bg-white/5 rounded-full overflow-hidden">
                                <div className="h-full bg-gradient-to-r from-plex to-plex-hover transition-all duration-500" style={{ width: `${progressPct}%` }} />
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 sm:p-8 lg:p-10 xl:p-12">
                            {error && (
                                <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-300 mb-6 text-sm flex items-start gap-3">
                                    <span className="text-red-400 flex-shrink-0 mt-0.5">⚠</span>
                                    <span>{error}</span>
                                </div>
                            )}

                            {step === 'welcome' && <WelcomeStep />}
                            {step === 'plex' && (
                                <MediaServerStep
                                    stepNumber={stepNumber}
                                    form={form}
                                    updateForm={updateForm}
                                    servers={servers}
                                    plexUsername={plexUsername}
                                    showManualToken={showManualToken}
                                    setShowManualToken={setShowManualToken}
                                    isLoading={isLoading}
                                    applyMediaServerType={applyMediaServerType}
                                    onPlexSignIn={handlePlexSignIn}
                                    onFetchServers={handleFetchServers}
                                    onPlexSignOut={handlePlexSignOut}
                                />
                            )}
                            {step === 'branding' && (
                                <BrandingStep
                                    stepNumber={stepNumber}
                                    form={form}
                                    updateForm={updateForm}
                                    applyBrandTheme={applyBrandTheme}
                                />
                            )}
                            {step === 'email' && (
                                <EmailStep
                                    stepNumber={stepNumber}
                                    form={form}
                                    updateForm={updateForm}
                                    testRecipient={testRecipient}
                                    setTestRecipient={setTestRecipient}
                                    isLoading={isLoading}
                                    onTestEmail={handleTestEmail}
                                />
                            )}
                            {step === 'integrations' && (
                                <IntegrationsStep
                                    stepNumber={stepNumber}
                                    form={form}
                                    updateForm={updateForm}
                                    activeTab={integrationTab}
                                    setActiveTab={setIntegrationTab}
                                />
                            )}
                            {step === 'finish' && <FinishStep stepNumber={stepNumber} form={form} />}
                        </div>

                        <div className="flex-shrink-0 border-t border-white/10 bg-black/25 backdrop-blur-md px-6 sm:px-8 lg:px-10 xl:px-12 py-5 flex items-center justify-between gap-4">
                            <button
                                type="button"
                                onClick={goBack}
                                disabled={stepIndex === 0 || isLoading}
                                className="flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-sm text-muted hover:text-text hover:bg-white/5 border border-transparent hover:border-white/10 transition-all disabled:opacity-30 disabled:pointer-events-none"
                            >
                                <ChevronLeft className="w-4 h-4" /> Back
                            </button>
                            <span className="hidden sm:block text-xs font-semibold text-muted/70">
                                {STEPS[stepIndex].label} · {stepNumber}/{STEPS.length}
                            </span>
                            {step === 'finish' ? (
                                <button type="button" onClick={handleComplete} disabled={isLoading || !canGoNext} className={SETUP_PRIMARY_BUTTON_CLASS}>
                                    {isLoading ? 'Saving…' : 'Complete Setup'} <Check className="w-4 h-4" />
                                </button>
                            ) : (
                                <button type="button" onClick={goNext} disabled={!canGoNext || isLoading} className={SETUP_PRIMARY_BUTTON_CLASS}>
                                    Continue <ChevronRight className="w-4 h-4" />
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
