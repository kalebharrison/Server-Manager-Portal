import React from 'react';
import { getPublicOrigin } from '../../shared/basePath';
import type { MainGridWidgetId } from '../../shared/dashboardLayout';
import type { MainGridWidgetDeps } from '../userDashboardWidgetTypes';
import type { WidgetRenderContext } from './shared';

export const renderEngagementWidget = (
    id: MainGridWidgetId,
    deps: MainGridWidgetDeps,
    ctx: WidgetRenderContext,
): React.ReactNode | undefined => {
    const {
        publicConfig,
        user,
        newsletterOptIn,
        handleToggleNewsletter,
        setToast,
    } = deps;
    const { showTempAccessMessage } = ctx;

    switch (id) {
        case 'announcement':
            if (!publicConfig?.announcement) return null;
            return (
                <div className="bg-plex/10 border border-plex/30 rounded-2xl p-3 md:p-4 shadow-lg">
                    <div className="flex items-start gap-3">
                        <span className="text-xl mt-0.5">📢</span>
                        <div>
                            <h3 className="text-plex font-bold text-sm uppercase tracking-wider mb-1">Announcement</h3>
                            <p className="text-text whitespace-pre-wrap text-sm leading-relaxed">{publicConfig.announcement}</p>
                        </div>
                    </div>
                </div>
            );
        case 'referral':
            if (!user) return null;
            return (
                <div className="glass-card p-4 md:p-5 shadow-lg">
                    <p className="text-plex font-bold text-base mb-1">🎁 Invite Friends</p>
                    <p className="text-muted text-sm leading-relaxed mb-4">Share this link. They get temporary access, and you get reward days!</p>
                    <div className="flex flex-col gap-2">
                        <input type="text" readOnly value={`${getPublicOrigin()}/?ref=${user.id}`} className="w-full p-3 rounded-lg border border-border bg-background text-text text-sm outline-none" />
                        <button onClick={() => { navigator.clipboard.writeText(`${getPublicOrigin()}/?ref=${user.id}`); setToast({ id: 99, message: 'Copied to clipboard!', type: 'success' }); }} className="w-full py-2.5 bg-plex text-background rounded-lg font-bold hover:bg-plex-hover transition-colors shadow-md">Copy Link</button>
                    </div>
                </div>
            );
        case 'newsletterPrefs':
            if (!user) return null;
            return (
                <div className="glass-card p-4 md:p-5 shadow-lg flex flex-col">
                    <p className="text-muted text-xs uppercase tracking-widest font-semibold mb-3 flex-shrink-0">Preferences</p>
                    <div className="flex items-center justify-between gap-4">
                        <div>
                            <p className="text-text font-bold text-sm">Weekly Newsletter</p>
                            <p className="text-muted text-xs mt-1 leading-relaxed">Opt in for library updates — more notice settings live in Preferences</p>
                        </div>
                        <button onClick={handleToggleNewsletter} aria-label="Toggle newsletter"
                            className={`relative inline-flex items-center w-14 h-7 rounded-full transition-all flex-shrink-0 border-2 ${newsletterOptIn ? 'bg-plex border-plex' : 'bg-background border-border'}`}>
                            <span className={`inline-block w-5 h-5 bg-white rounded-full shadow-sm transition-transform duration-300 ${newsletterOptIn ? 'translate-x-8' : 'translate-x-1'}`} />
                        </button>
                    </div>
                </div>
            );
        case 'support':
            return (
                <div className="glass-card p-4 md:p-5 shadow-lg flex flex-col">
                    {showTempAccessMessage ? (
                        <div className="mb-3 md:mb-4 flex-shrink-0">
                            <p className="text-plex font-bold text-base mb-1">🍿 Enjoying your Temporary Access?</p>
                            <p className="text-muted text-sm leading-relaxed">Once your 3-day access ends, you'll lose access. Get in touch with the admin to extend your access!</p>
                        </div>
                    ) : (
                        <div className="mb-3 md:mb-4 flex-shrink-0">
                            <p className="text-text font-bold text-base mb-1">💬 Need Help?</p>
                            <p className="text-muted text-sm leading-relaxed">Contact the admin to extend your access, report an issue, or get support.</p>
                        </div>
                    )}
                    <div className="flex flex-col gap-3 mt-auto">
                        {publicConfig?.contactWhatsApp && (
                            <a href={`https://wa.me/${publicConfig.contactWhatsApp}`} target="_blank" rel="noreferrer"
                                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs transition-all border bg-[#25D366]/10 border-[#25D366]/30 text-[#25D366] hover:bg-[#25D366]/20">
                                WhatsApp
                            </a>
                        )}
                        {publicConfig?.contactEmail && (
                            <a href={`mailto:${publicConfig.contactEmail}`}
                                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs transition-all border bg-white/5 border-white/10 text-text hover:bg-white/10">
                                Email
                            </a>
                        )}
                    </div>
                </div>
            );
        default:
            return undefined;
    }
};
