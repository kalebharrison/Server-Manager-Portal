import { blockIfImpersonating } from './impersonation.js';

export const registerRequestAppRoutes = ({
    app,
    requireAuth,
    requireMember,
    requireAdmin,
    configPath,
    loadFile,
    requestAppService,
    appendAuditLog,
    log,
}) => {
    const loadConfig = () => loadFile(configPath, {});

    const sendGateOrRun = async (req, res, action) => {
        const config = await loadConfig();
        const gate = requestAppService.getRequestAppGate(config);
        if (!gate.ready) {
            return res.status(503).json({ ...gate, connected: false });
        }
        return action(config, gate);
    };

    const handleError = (res, err, fallback = 'Request app operation failed') => {
        const message = err?.message || fallback;
        return res.status(502).json({ error: message, connected: false });
    };

    app.get('/api/request-app/status', requireAuth, requireMember, async (req, res) => {
        try {
            const config = await loadConfig();
            const gate = requestAppService.getRequestAppGate(config);
            res.json({
                ...gate,
                type: String(config.requestAppType || 'none').toLowerCase(),
                publicUrl: config.requestAppUrl || '',
            });
        } catch (err) {
            handleError(res, err, 'Failed to read request app status');
        }
    });

    app.get('/api/request-app/image', requireAuth, requireMember, async (req, res) => {
        try {
            const image = await requestAppService.getPosterImage(req.query.url);
            res.setHeader('Content-Type', image.contentType);
            res.setHeader('Cache-Control', 'private, max-age=86400, stale-while-revalidate=604800');
            res.send(image.body);
        } catch (err) {
            const unsupported = err?.message === 'Unsupported poster source';
            res.status(unsupported ? 400 : 502).json({ error: unsupported ? err.message : 'Failed to load poster' });
        }
    });

    app.get('/api/request-app/discover', requireAuth, requireMember, async (req, res) => {
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

    app.get('/api/request-app/search', requireAuth, requireMember, async (req, res) => {
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

    app.get('/api/request-app/media/:type/:tmdbId', requireAuth, requireMember, async (req, res) => {
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

    app.post('/api/request-app/media/:type/:tmdbId/request', requireAuth, requireMember, async (req, res) => {
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

    app.post('/api/request-app/media/:type/:tmdbId/issue', requireAuth, requireMember, async (req, res) => {
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

    app.get('/api/requests/count', requireAdmin, async (req, res) => {
        try {
            await sendGateOrRun(req, res, async (config, gate) => {
                const counts = await requestAppService.getRequestCounts(config);
                res.json({ ...gate, connected: true, ...counts });
            });
        } catch (err) {
            log(`Request count load failed: ${err.message}`);
            handleError(res, err, 'Failed to load request counts');
        }
    });

    app.get('/api/requests', requireAdmin, async (req, res) => {
        try {
            await sendGateOrRun(req, res, async (config) => {
                const data = await requestAppService.listRequests(config, {
                    filter: req.query.filter,
                    take: req.query.take,
                    skip: req.query.skip,
                });
                res.json({ connected: true, ...data });
            });
        } catch (err) {
            handleError(res, err, 'Failed to load requests');
        }
    });

    app.post('/api/requests/:requestId/approve', requireAdmin, async (req, res) => {
        try {
            await sendGateOrRun(req, res, async (config) => {
                const result = await requestAppService.approveRequest(config, req.params.requestId);
                await appendAuditLog('request_app_request_approved', req.user, null, { requestId: req.params.requestId, title: req.body?.title || '' });
                res.json({ success: true, result });
            });
        } catch (err) {
            handleError(res, err, 'Failed to approve request');
        }
    });

    app.post('/api/requests/:requestId/decline', requireAdmin, async (req, res) => {
        try {
            await sendGateOrRun(req, res, async (config) => {
                const result = await requestAppService.declineRequest(config, req.params.requestId, String(req.body?.reason || ''));
                await appendAuditLog('request_app_request_declined', req.user, null, { requestId: req.params.requestId, title: req.body?.title || '' });
                res.json({ success: true, result });
            });
        } catch (err) {
            handleError(res, err, 'Failed to decline request');
        }
    });

    app.post('/api/requests/:requestId/retry', requireAdmin, async (req, res) => {
        try {
            await sendGateOrRun(req, res, async (config) => {
                const result = await requestAppService.retryRequest(config, req.params.requestId);
                await appendAuditLog('request_app_request_retried', req.user, null, { requestId: req.params.requestId, title: req.body?.title || '' });
                res.json({ success: true, result });
            });
        } catch (err) {
            handleError(res, err, 'Failed to retry request');
        }
    });

    app.delete('/api/requests/:requestId', requireAdmin, async (req, res) => {
        try {
            await sendGateOrRun(req, res, async (config) => {
                const result = await requestAppService.deleteRequest(config, req.params.requestId);
                await appendAuditLog('request_app_request_deleted', req.user, null, { requestId: req.params.requestId, title: req.body?.title || '' });
                res.json({ success: true, result });
            });
        } catch (err) {
            handleError(res, err, 'Failed to delete request');
        }
    });
};
