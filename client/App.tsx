import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { bindAppConfirm } from './shared/confirm';
import { apiFetch } from './shared/api';
import { Loader } from './shared/toast';
import { AppAmbientBackground } from './shared/theme';
import { PORTAL_WIDE_LAYOUT_THRESHOLD } from './shared/portalLayout';
import { applyLocalPortalPreferences, loadLocalPortalPreferences, USER_PREFERENCES_EVENT } from './shared/userPreferences';
import { updateFavicon, Navigation } from './lazyScreens';
import { AppRouteRenderer, RouteFallback } from './app/AppRouteRenderer';
import { useAppRouting, useAppSession } from './app/useAppSession';
import { DiscoverChatWidget } from './requests/DiscoverChatWidget';

const ConfirmModal = React.lazy(() => import('./shared/ConfirmModal').then(module => ({ default: module.ConfirmModal })));

export const MainApp: React.FC = () => {
    const [confirmState, setConfirmState] = useState<{ isOpen: boolean, message: string, onConfirm: () => void }>({ isOpen: false, message: '', onConfirm: () => { } });
    const [contentMaxWidth, setContentMaxWidth] = useState<string>('100%');
    const [activeTheme, setActiveTheme] = useState(() => {
        if (typeof window !== 'undefined') {
            return localStorage.getItem('portal-theme') || 'plex';
        }
        return 'plex';
    });

    useEffect(() => {
        bindAppConfirm((message, onConfirm) => {
            setConfirmState({ isOpen: true, message, onConfirm });
        });
    }, []);

    useEffect(() => {
        const updateResponsiveContentWidth = () => {
            const screenWidth = window.screen?.width || window.innerWidth;
            const screenHeight = window.screen?.height || window.innerHeight;
            const screenRatio = screenWidth / Math.max(1, screenHeight);
            if (screenRatio > PORTAL_WIDE_LAYOUT_THRESHOLD) {
                setContentMaxWidth(`${Math.round(screenHeight * (16 / 9))}px`);
            } else {
                setContentMaxWidth('100%');
            }
        };

        updateResponsiveContentWidth();
        window.addEventListener('resize', updateResponsiveContentWidth);
        return () => window.removeEventListener('resize', updateResponsiveContentWidth);
    }, []);

    const closeConfirm = () => setConfirmState(s => ({ ...s, isOpen: false }));
    const handleConfirm = () => {
        confirmState.onConfirm();
        closeConfirm();
    };

    const [publicConfig, setPublicConfig] = useState<any>({});
    const [localPreferences, setLocalPreferences] = useState(loadLocalPortalPreferences);
    const effectivePublicConfig = useMemo(() => applyLocalPortalPreferences(publicConfig, localPreferences), [localPreferences, publicConfig]);
    const { currentRoute, updateRoute, setRoute } = useAppRouting();
    const {
        sessionInfo,
        checkSession,
        handleLogout,
        handleViewAsUser,
        handleStopImpersonation,
    } = useAppSession(publicConfig, updateRoute);

    const fetchPublicConfig = useCallback(async (forceRefresh = false) => {
        try {
            const data = await apiFetch(forceRefresh ? '/api/config/public?refresh=1' : '/api/config/public', { forceRefresh });
            if (typeof data.basePath === 'string') {
                window.__BASE_PATH__ = data.basePath;
            }
            setPublicConfig(data);

            if (data.customLogoUrl) {
                updateFavicon(data.customLogoUrl);
            }
        } catch (e) { }
    }, []);

    useEffect(() => {
        const updatePreferences = () => setLocalPreferences(loadLocalPortalPreferences());
        window.addEventListener(USER_PREFERENCES_EVENT, updatePreferences);
        return () => window.removeEventListener(USER_PREFERENCES_EVENT, updatePreferences);
    }, []);

    useEffect(() => {
        window.__USE_24_HOUR_CLOCK__ = effectivePublicConfig.use24HourClock === true;
    }, [effectivePublicConfig.use24HourClock]);

    const lastBrandingTheme = useRef<string | null>(null);

    useEffect(() => {
        if (!publicConfig.brandingTheme) return;

        if (lastBrandingTheme.current === null) {
            const theme = localStorage.getItem('portal-theme') || publicConfig.brandingTheme || 'plex';
            setActiveTheme(theme);
            lastBrandingTheme.current = publicConfig.brandingTheme;
        } else if (publicConfig.brandingTheme !== lastBrandingTheme.current) {
            setActiveTheme(publicConfig.brandingTheme);
            localStorage.setItem('portal-theme', publicConfig.brandingTheme);
            lastBrandingTheme.current = publicConfig.brandingTheme;
        }
    }, [publicConfig.brandingTheme]);

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', activeTheme);
        localStorage.setItem('portal-theme', activeTheme);
        document.documentElement.style.removeProperty('--color-plex');
        document.documentElement.style.removeProperty('--color-plex-hover');
    }, [activeTheme]);

    useEffect(() => {
        if (effectivePublicConfig?.useBrandedSkeleton !== false) {
            document.documentElement.classList.add('branded-skeleton');
        } else {
            document.documentElement.classList.remove('branded-skeleton');
        }
    }, [effectivePublicConfig?.useBrandedSkeleton]);

    useEffect(() => {
        fetchPublicConfig();
    }, [fetchPublicConfig]);

    useEffect(() => {
        const onPublicConfigUpdated = () => { fetchPublicConfig(true); };
        window.addEventListener('portal-public-config-updated', onPublicConfigUpdated);
        return () => window.removeEventListener('portal-public-config-updated', onPublicConfigUpdated);
    }, [fetchPublicConfig]);

    const onLogout = async () => {
        await handleLogout();
        setRoute('login');
    };

    const onViewAsUser = async (userId: string) => {
        await handleViewAsUser(userId);
        setRoute('user');
    };

    const onStopImpersonation = async () => {
        await handleStopImpersonation();
        setRoute('users');
    };

    if (currentRoute === 'loading') return <Loader isLoading={true} isCinematic={!!effectivePublicConfig?.useCinematicLoading} />;

    const isAdmin = !!sessionInfo?.session?.isAdmin;
    const isImpersonating = !!sessionInfo?.impersonation?.active;
    const isPublicStatus = currentRoute === 'status' && !sessionInfo;
    const isPublicInvite = currentRoute === 'invite';
    const isPublicView = isPublicStatus || isPublicInvite;

    return (
        <div className="relative flex w-full min-h-screen overflow-x-clip">
            <AppAmbientBackground backgroundImageUrl={publicConfig?.backgroundImageUrl} />
            {confirmState.isOpen && (
                <React.Suspense fallback={null}>
                    <ConfirmModal isOpen={true} message={confirmState.message} onConfirm={handleConfirm} onCancel={closeConfirm} />
                </React.Suspense>
            )}
            <React.Suspense fallback={null}>
                {!isPublicView && <Navigation currentRoute={currentRoute} onNavigate={setRoute as any} onLogout={onLogout} isAdmin={isAdmin} serverName={sessionInfo?.serverName || 'Server Portal'} adminThumb={sessionInfo?.adminThumb} customLogoUrl={publicConfig?.customLogoUrl} navOrder={sessionInfo?.navOrder || ['home', 'discover', 'issues', 'status', 'analytics', 'mediastack', 'request', 'settings', 'logout']} navFeatures={sessionInfo?.navFeatures} appVersion={publicConfig.appVersion} activeTheme={activeTheme} setActiveTheme={setActiveTheme} />}
            </React.Suspense>
            <div className={`relative z-10 flex-1 min-w-0 flex flex-col items-center px-4 pt-20 pb-[80px] md:p-8 md:pt-8 md:pb-8 overflow-x-visible ${isPublicView ? '!pt-8 !pb-8' : ''}`}>
                {isImpersonating && (
                    <div className="w-full mb-4" style={{ maxWidth: contentMaxWidth }}>
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 py-3 rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-100 shadow-lg">
                            <p className="text-sm font-medium">Viewing as <strong className="text-white">{sessionInfo?.impersonation?.targetUsername || sessionInfo?.session?.username}</strong>. Changes and requests are disabled.</p>
                            <button type="button" onClick={onStopImpersonation} className="px-4 py-2 rounded-lg bg-amber-500/20 border border-amber-500/40 text-sm font-bold hover:bg-amber-500/30 whitespace-nowrap">Exit view</button>
                        </div>
                    </div>
                )}
                <div className="w-full min-w-0" style={{ maxWidth: contentMaxWidth }}>
                    <React.Suspense fallback={<RouteFallback />}>
                        <AppRouteRenderer
                            currentRoute={currentRoute}
                            sessionInfo={sessionInfo}
                            effectivePublicConfig={effectivePublicConfig}
                            activeTheme={activeTheme}
                            setActiveTheme={setActiveTheme}
                            checkSession={checkSession}
                            setRoute={setRoute}
                            handleViewAsUser={onViewAsUser}
                            isAdmin={isAdmin}
                            isImpersonating={isImpersonating}
                            isPublicStatus={isPublicStatus}
                        />
                    </React.Suspense>
                </div>

                {!isPublicView && publicConfig?.appVersion && (
                    <div className="md:hidden mt-auto pt-12 pb-4 w-full text-center text-[10px] text-white/30 font-mono tracking-widest pointer-events-none">
                        {publicConfig.appVersion}
                    </div>
                )}
            </div>
            {!isPublicView && sessionInfo && (
                <DiscoverChatWidget
                    enabled={sessionInfo?.navFeatures?.request !== false}
                    readOnly={isImpersonating}
                />
            )}
        </div>
    );
};
