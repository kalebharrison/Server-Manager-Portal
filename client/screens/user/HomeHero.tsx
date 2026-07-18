import { memo, useMemo } from 'react';

import { portalUrl, resolvePortalAssetUrl } from '../../shared/basePath';
import { SlideshowBackground } from '../../shared/theme';
import { resolveDisplayName } from '../../shared/userProfile';
import { buildHeroMovieColumns, resolveHomeImage } from './userDashboardUtils';

type Props = {
    analytics: any;
    dashboardData: any;
    publicConfig: any;
    sessionInfo: any;
    user: any;
};

const greetingForCurrentTime = () => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return 'Good Morning';
    if (hour >= 12 && hour < 17) return 'Good Afternoon';
    if (hour >= 17 && hour < 22) return 'Good Evening';
    return 'Good Night';
};

export const HomeHero = memo<Props>(({ analytics, dashboardData, publicConfig, sessionInfo, user }) => {
    const heroMovieColumns = useMemo(
        () => buildHeroMovieColumns(dashboardData?.recentMovies),
        [dashboardData?.recentMovies],
    );
    const heroBgRaw = analytics?.recentHistory?.[0]?.thumbUrl || publicConfig?.customLogoUrl || '';
    const heroBg = heroBgRaw
        ? (heroBgRaw.startsWith('http') ? heroBgRaw : resolvePortalAssetUrl(heroBgRaw))
        : '';
    const thumbUrl = user?.thumb || sessionInfo.session.thumb || (sessionInfo.session.isAdmin ? sessionInfo.adminThumb : null);
    const username = resolveDisplayName(user || sessionInfo.session);

    return (
        <div className="relative w-full rounded-2xl overflow-hidden shadow-2xl bg-card border border-border">
            <div className="absolute inset-0 bg-background overflow-hidden">
                {publicConfig?.useTrendingSlideshow && publicConfig?.trendingBackgrounds?.length > 0 ? (
                    <>
                        <div className="absolute inset-0 opacity-100">
                            <SlideshowBackground backgrounds={publicConfig.trendingBackgrounds} intervalSeconds={publicConfig.trendingSlideshowInterval} opacity={1} />
                        </div>
                        <div className="absolute inset-0 bg-gradient-to-t from-card via-card/50 to-transparent" />
                        <div className="absolute inset-0 bg-gradient-to-r from-card via-card/20 to-transparent" />
                        <div className="absolute inset-0 bg-black/10" />
                    </>
                ) : heroMovieColumns.length > 0 ? (
                    <>
                        <div className="absolute -inset-[50%] opacity-40 transform -rotate-12 scale-110 flex gap-4 overflow-hidden pointer-events-none justify-center">
                            {heroMovieColumns.map((column, colIdx) => (
                                <div key={colIdx} className={`flex flex-col gap-4 ${colIdx % 2 === 0 ? 'animate-[scrollVertical_40s_linear_infinite]' : 'animate-[scrollVertical_50s_linear_infinite_reverse]'}`}>
                                    {column.map((movie: any, index: number) => (
                                        <img
                                            key={`c${colIdx}-${movie.ratingKey || movie.sourceRatingKey || movie.title || index}-${index}`}
                                            src={movie.thumbUrl ? resolvePortalAssetUrl(movie.thumbUrl) : portalUrl(`/api/plex/image?path=${encodeURIComponent(movie.thumb)}&width=200&height=300`)}
                                            className="w-32 md:w-48 rounded-xl object-cover"
                                            alt=""
                                            loading="lazy"
                                            decoding="async"
                                        />
                                    ))}
                                </div>
                            ))}
                        </div>
                        <div className="absolute inset-0 bg-gradient-to-t from-card via-card/80 to-transparent" />
                        <div className="absolute inset-0 bg-gradient-to-r from-card via-card/40 to-transparent" />
                    </>
                ) : heroBg ? (
                    <>
                        <div className="absolute inset-0 bg-cover bg-center opacity-30 blur-2xl scale-110" style={{ backgroundImage: `url(${heroBg})` }} />
                        <div className="absolute inset-0 bg-gradient-to-t from-card via-card/80 to-transparent" />
                        <div className="absolute inset-0 bg-gradient-to-r from-card via-card/40 to-transparent" />
                    </>
                ) : (
                    <>
                        <div className="absolute inset-0 bg-gradient-to-t from-card via-card/80 to-transparent" />
                        <div className="absolute inset-0 bg-gradient-to-r from-card via-card/40 to-transparent" />
                    </>
                )}
            </div>

            <div className="relative pt-14 pb-5 px-4 md:pt-32 md:pb-12 md:px-12 flex flex-col items-center md:items-start text-center md:text-left z-10">
                <div className="flex flex-col md:flex-row items-center md:items-end gap-4 md:gap-6">
                    <div className="relative">
                        {thumbUrl && (
                            <img
                                src={resolveHomeImage(thumbUrl)}
                                alt={username}
                                className="relative w-28 h-28 md:w-32 md:h-32 rounded-full object-cover border-4 border-plex shadow-2xl bg-card"
                                onError={(event) => {
                                    (event.target as HTMLImageElement).style.display = 'none';
                                    (event.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
                                    (event.target as HTMLImageElement).nextElementSibling?.classList.add('flex');
                                }}
                            />
                        )}
                        <div className={`${thumbUrl ? 'hidden' : 'flex'} relative w-28 h-28 md:w-32 md:h-32 rounded-full bg-gradient-to-br from-plex/40 to-plex/10 border-4 border-plex items-center justify-center text-plex font-black text-5xl shadow-2xl overflow-hidden`}>
                            {username?.[0]?.toUpperCase() || '?'}
                        </div>
                    </div>

                    <div className="pb-2">
                        <p className="text-plex text-sm uppercase tracking-[4px] font-bold mb-1 drop-shadow-md">{greetingForCurrentTime()}</p>
                        <h1 className="text-4xl md:text-5xl font-black text-transparent bg-clip-text bg-gradient-to-b from-white to-gray-400 leading-tight drop-shadow-lg" style={{ fontSize: 'clamp(1.6rem, 8vw, 3rem)', wordBreak: 'break-word' }}>
                            {username}
                        </h1>
                        {sessionInfo.session.isAdmin && (
                            <span className="inline-block mt-3 px-3 py-1 rounded-full text-[10px] font-black bg-plex/20 text-plex border border-plex/40 uppercase tracking-widest">Server Admin</span>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
});

HomeHero.displayName = 'HomeHero';
