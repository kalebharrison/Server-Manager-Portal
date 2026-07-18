import React from 'react';
import { AlertTriangle } from 'lucide-react';

import { logoUrl, resolvePortalAssetUrl } from '../../shared/basePath';
import { AuthPageBackground, themeClasses } from '../../shared/theme';
import { Loader } from '../../shared/toast';
import { LivePlexStats, PublicUptimeBanner } from '../PublicStats';
import { JELLYFIN_ICON_URL } from './loginUtils';
import type { LoginState } from './useLogin';
import type { PublicInfo } from './useLogin';

const loginSecondaryBtnClass = `${themeClasses.btnSecondary} w-full px-8 py-4 text-base`;

type LoginViewProps = LoginState & {
    publicConfig?: any;
    publicInfo: PublicInfo;
};

export const LoginView: React.FC<LoginViewProps> = ({
    publicConfig,
    publicInfo,
    isLoading,
    error,
    jellyfinUsername,
    setJellyfinUsername,
    jellyfinPassword,
    setJellyfinPassword,
    showJellyfinPassword,
    setShowJellyfinPassword,
    quickConnect,
    handlePlexLogin,
    handleJellyfinLogin,
    handleJellyfinQuickConnect,
    handleOpenJellyfinQuickConnect,
}) => {
    const mediaServerType = String(publicConfig?.mediaServerType || publicInfo.mediaServerType || 'plex').toLowerCase();
    const isJellyfinAuth = mediaServerType === 'jellyfin';
    const logoSrc = publicConfig?.customLogoUrl
        ? resolvePortalAssetUrl(publicConfig.customLogoUrl)
        : (publicInfo.thumb ? resolvePortalAssetUrl(publicInfo.thumb) : '');
    const splashBackgroundUrl = publicConfig?.backgroundImageUrl ? resolvePortalAssetUrl(publicConfig.backgroundImageUrl) : undefined;

    return (
        <div className="relative min-h-screen w-full flex flex-col items-center justify-center p-4 sm:p-6 md:p-8 lg:p-10 overflow-hidden">
            <AuthPageBackground backgroundImageUrl={splashBackgroundUrl} trendingBackgrounds={publicConfig?.useTrendingSlideshowOnLogin ? publicConfig?.trendingBackgrounds : undefined} trendingSlideshowInterval={publicConfig?.trendingSlideshowInterval} />
            <Loader isLoading={isLoading} isCinematic={!!publicConfig?.useCinematicLoading} />

            <div className="relative z-10 w-full max-w-6xl flex flex-col gap-6">
                <div className="glass-card-lg overflow-hidden flex flex-col max-w-xl mx-auto w-full">
                    <div className="flex flex-col justify-center items-center text-center p-6 sm:p-8 lg:p-10 xl:p-12 min-w-0 w-full py-10 sm:py-12">
                        <div className="relative mb-8">
                            {!logoSrc && <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-36 h-36 bg-plex/20 rounded-full blur-[60px] pointer-events-none" />}
                            {logoSrc ? (
                                <img
                                    src={logoSrc}
                                    alt="Server Logo"
                                    className={publicConfig?.customLogoUrl
                                        ? 'w-40 h-40 sm:w-48 sm:h-48 object-contain drop-shadow-[0_0_40px_rgba(229,160,13,0.25)] relative z-10'
                                        : 'w-28 h-28 sm:w-32 sm:h-32 object-cover rounded-full border-2 border-plex/40 shadow-[0_0_40px_rgba(229,160,13,0.25)] relative z-10'}
                                    onError={(e) => {
                                        e.currentTarget.src = logoUrl();
                                        e.currentTarget.className = 'w-28 h-28 sm:w-32 sm:h-32 object-cover rounded-full border-2 border-plex/40 shadow-[0_0_40px_rgba(229,160,13,0.25)] relative z-10';
                                    }}
                                />
                            ) : (
                                <img src={logoUrl()} alt="Server Logo" className="w-28 h-28 sm:w-32 sm:h-32 object-cover rounded-full border-2 border-plex/40 shadow-[0_0_40px_rgba(229,160,13,0.25)] relative z-10" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                            )}
                        </div>

                        <h1 className="text-3xl sm:text-4xl font-black text-text tracking-tight mb-3">
                            {publicInfo.serverName}
                        </h1>
                        <p className="text-muted text-sm sm:text-base leading-relaxed mb-8 max-w-sm">
                            {isJellyfinAuth
                                ? 'Sign in with your Jellyfin account to access your portal and manage your subscription.'
                                : 'Sign in with Plex to access your portal and manage your subscription.'}
                        </p>

                        {isJellyfinAuth ? (
                            <div className="w-full max-w-sm flex flex-col gap-4 text-left">
                                <button type="button" className={loginSecondaryBtnClass} onClick={handleJellyfinQuickConnect} disabled={isLoading}>
                                    <img src={JELLYFIN_ICON_URL} alt="" className="w-5 h-5 object-contain" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                                    Login with Jellyfin
                                </button>

                                {quickConnect && (
                                    <div className="w-full rounded-xl border border-plex/30 bg-plex/10 p-4 text-center">
                                        <p className="text-[10px] font-bold text-muted uppercase tracking-[0.14em] mb-2">Quick Connect code</p>
                                        <div className="font-black text-3xl tracking-[0.18em] text-text tabular-nums mb-3">{quickConnect.code}</div>
                                        <p className="text-xs text-muted leading-relaxed">
                                            Approve this code in Jellyfin Quick Connect. This page will finish login automatically.
                                        </p>
                                        {quickConnect.jellyfinUrl && (
                                            <button
                                                type="button"
                                                onClick={handleOpenJellyfinQuickConnect}
                                                className="mt-3 inline-flex items-center justify-center text-xs font-bold text-plex hover:text-text transition"
                                            >
                                                Copy code & open Quick Connect
                                            </button>
                                        )}
                                    </div>
                                )}

                                <button
                                    type="button"
                                    className="self-center text-xs font-bold text-muted hover:text-text transition"
                                    onClick={() => setShowJellyfinPassword((value) => !value)}
                                >
                                    {showJellyfinPassword ? 'Hide password login' : 'Use password instead'}
                                </button>

                                {showJellyfinPassword && (
                                    <form onSubmit={handleJellyfinLogin} className="w-full flex flex-col gap-3 text-left">
                                        <label className="flex flex-col gap-1.5">
                                            <span className="text-[10px] font-bold text-muted uppercase tracking-[0.14em]">Jellyfin username</span>
                                            <input
                                                value={jellyfinUsername}
                                                onChange={(e) => setJellyfinUsername(e.target.value)}
                                                autoComplete="username"
                                                className="w-full bg-black/25 border border-white/15 rounded-xl px-4 py-3 text-sm text-text outline-none focus:border-plex/70 focus:ring-2 focus:ring-plex/20 transition"
                                                placeholder="Username"
                                                disabled={isLoading}
                                                required
                                            />
                                        </label>
                                        <label className="flex flex-col gap-1.5">
                                            <span className="text-[10px] font-bold text-muted uppercase tracking-[0.14em]">Password</span>
                                            <input
                                                value={jellyfinPassword}
                                                onChange={(e) => setJellyfinPassword(e.target.value)}
                                                type="password"
                                                autoComplete="current-password"
                                                className="w-full bg-black/25 border border-white/15 rounded-xl px-4 py-3 text-sm text-text outline-none focus:border-plex/70 focus:ring-2 focus:ring-plex/20 transition"
                                                placeholder="Password"
                                                disabled={isLoading}
                                                required
                                            />
                                        </label>
                                        <button type="submit" className={loginSecondaryBtnClass} disabled={isLoading || !jellyfinUsername.trim() || !jellyfinPassword}>
                                            <img src={JELLYFIN_ICON_URL} alt="" className="w-5 h-5 object-contain" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                                            Login with password
                                        </button>
                                    </form>
                                )}
                            </div>
                        ) : (
                            <button type="button" className={loginSecondaryBtnClass} onClick={handlePlexLogin} disabled={isLoading}>
                                <img src={logoUrl()} alt="" className="w-5 h-5 object-contain opacity-80" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                                Login with Plex
                            </button>
                        )}

                        {!isJellyfinAuth && publicConfig?.showLoginServerStats === true && (
                            <div className="w-full mt-10 pt-8 border-t border-white/10">
                                <LivePlexStats enabled />
                            </div>
                        )}
                    </div>
                </div>

                <PublicUptimeBanner enabled={publicConfig?.publicStatusEnabled === true} />

                {error && (
                    <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-300 text-sm flex items-start gap-3">
                        <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5 text-red-400" />
                        <span>{error}</span>
                    </div>
                )}
            </div>
        </div>
    );
};
