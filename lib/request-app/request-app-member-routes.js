import { tryAttachPortalAgent } from '../auth/portal-agent-key.js';
import { blockIfImpersonating } from '../auth/impersonation.js';

export const registerRequestAppMemberRoutes = ({
    app,
    requireAuth,
    requireMember,
    memberApiRateLimit = null,
    loadConfig,
    requestAppService,
    discoverChat = null,
    sendGateOrRun,
    handleError,
    appendAuditLog,
}) => {
    const requireMemberOrPortalAgent = (req, res, next) => {
        if (tryAttachPortalAgent(req)) return next();
        return requireAuth(req, res, () => requireMember(req, res, next));
    };
    app.get('/api/request-app/status', requireAuth, requireMember, memberApiRateLimit || ((req, res, next) => next()), async (req, res) => {
        try {
            const config = await loadConfig();
            const gate = requestAppService.getRequestAppGate(config);
            res.json({
                ...gate,
                type: String(config.requestAppType || 'none').toLowerCase(),
            });
        } catch (err) {
            handleError(res, err, 'Failed to read request app status');
        }
    });

    app.get('/api/request-app/image', requireAuth, requireMember, memberApiRateLimit || ((req, res, next) => next()), async (req, res) => {
        try {
            const cached = requestAppService.getCachedPosterImage(req.query.url);
            if (!cached.image) {
                void requestAppService.warmPosterImage(cached.remoteUrl);
                res.setHeader('Cache-Control', 'private, max-age=300');
                return res.redirect(307, cached.remoteUrl);
            }
            res.setHeader('Content-Type', cached.image.contentType);
            res.setHeader('Cache-Control', 'private, max-age=86400, stale-while-revalidate=604800');
            res.send(cached.image.body);
        } catch (err) {
            const unsupported = err?.message === 'Unsupported poster source';
            res.status(unsupported ? 400 : 502).json({ error: unsupported ? err.message : 'Failed to load poster' });
        }
    });

    app.get('/api/request-app/discover', requireAuth, requireMember, memberApiRateLimit || ((req, res, next) => next()), async (req, res) => {
        try {
            await sendGateOrRun(req, res, async (config) => {
                const data = await requestAppService.discover(config, {
                    category: String(req.query.category || 'trending'),
                    mediaType: String(req.query.type || req.query.mediaType || 'all'),
                    anime: String(req.query.anime || '') === 'true',
                    foreign: String(req.query.foreign || '') === 'true',
                    genreId: req.query.genreId,
                    page: req.query.page,
                });
                res.json({ connected: true, ...data });
            });
        } catch (err) {
            handleError(res, err, 'Failed to load request app discovery');
        }
    });

    app.get('/api/request-app/search', requireAuth, requireMember, memberApiRateLimit || ((req, res, next) => next()), async (req, res) => {
        try {
            await sendGateOrRun(req, res, async (config) => {
                const data = await requestAppService.search(config, {
                    query: req.query.query,
                    mediaType: String(req.query.type || req.query.mediaType || 'all'),
                    anime: String(req.query.anime || '') === 'true',
                    foreign: String(req.query.foreign || '') === 'true',
                    genreId: req.query.genreId,
                    page: req.query.page,
                });
                res.json({ connected: true, ...data });
            });
        } catch (err) {
            handleError(res, err, 'Failed to search request app');
        }
    });

    app.post('/api/request-app/discover-chat', memberApiRateLimit || ((req, res, next) => next()), requireMemberOrPortalAgent, async (req, res) => {
        try {
            await sendGateOrRun(req, res, async (config) => {
                if (!discoverChat?.runDiscoverChat) {
                    return res.status(503).json({
                        connected: true,
                        ok: false,
                        ready: false,
                        error: 'Discovery chat is not available.',
                        answer: 'Discovery chat is not available.',
                        results: [],
                    });
                }
                const outcome = await discoverChat.runDiscoverChat(config, {
                    query: req.body?.query || req.body?.message || '',
                    history: req.body?.history,
                });
                if (outcome.ready === false) {
                    return res.status(503).json({ connected: true, ...outcome });
                }
                if (typeof appendAuditLog === 'function') {
                    void appendAuditLog('discover_chat_asked', req.user, null, {
                        query: String(req.body?.query || req.body?.message || '').slice(0, 120),
                    });
                }
                res.json({ connected: true, ...outcome });
            });
        } catch (err) {
            handleError(res, err, 'Failed to run discovery chat');
        }
    });

    app.get('/api/request-app/media/:type/:tmdbId', requireAuth, requireMember, memberApiRateLimit || ((req, res, next) => next()), async (req, res) => {
        try {
            await sendGateOrRun(req, res, async (config) => {
                const item = await requestAppService.getMediaDetails(config, {
                    mediaType: req.params.type,
                    tmdbId: req.params.tmdbId,
                });
                res.json({ connected: true, item });
            });
        } catch (err) {
            handleError(res, err, 'Failed to load media details');
        }
    });

    app.post('/api/request-app/media/:type/:tmdbId/request', requireAuth, requireMember, memberApiRateLimit || ((req, res, next) => next()), async (req, res) => {
        if (blockIfImpersonating(req, res)) return;
        try {
            await sendGateOrRun(req, res, async (config) => {
                const result = await requestAppService.requestMedia(config, {
                    mediaType: req.params.type,
                    tmdbId: req.params.tmdbId,
                    seasons: req.body?.seasons,
                    is4k: req.body?.is4k,
                    sessionUser: req.user,
                });
                await appendAuditLog('request_app_media_requested', req.user, null, {
                    mediaType: req.params.type,
                    tmdbId: req.params.tmdbId,
                    title: req.body?.title || '',
                });
                res.json({ success: true, result });
            });
        } catch (err) {
            handleError(res, err, 'Failed to submit media request');
        }
    });

    app.post('/api/request-app/media/:type/:tmdbId/issue', requireAuth, requireMember, memberApiRateLimit || ((req, res, next) => next()), async (req, res) => {
        if (blockIfImpersonating(req, res)) return;
        try {
            await sendGateOrRun(req, res, async (config) => {
                const detail = await requestAppService.getMediaDetails(config, {
                    mediaType: req.params.type,
                    tmdbId: req.params.tmdbId,
                });
                if (!detail?.mediaId) {
                    return res.status(409).json({ error: 'This title is not tracked by the request app yet.' });
                }
                const result = await requestAppService.reportIssue(config, {
                    mediaId: detail.mediaId,
                    issueType: req.body?.issueType,
                    message: req.body?.message,
                    problemSeason: req.body?.problemSeason,
                    problemEpisode: req.body?.problemEpisode,
                    sessionUser: req.user,
                });
                await appendAuditLog('request_app_issue_reported', req.user, null, {
                    mediaType: req.params.type,
                    tmdbId: req.params.tmdbId,
                    title: req.body?.title || detail.title || '',
                    issueType: req.body?.issueType || 'other',
                });
                res.json({ success: true, result });
            });
        } catch (err) {
            handleError(res, err, 'Failed to report media issue');
        }
    });
};
