export const registerRequestAppAdminRoutes = ({
    app,
    requireAdmin,
    sendGateOrRun,
    handleError,
    requestAppService,
    appendAuditLog,
    notifyRequestUpdate = null,
    log,
}) => {
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

    app.get('/api/requests/:requestId', requireAdmin, async (req, res) => {
        try {
            await sendGateOrRun(req, res, async (config) => {
                const request = await requestAppService.getRequest(config, req.params.requestId);
                res.json({ connected: true, request });
            });
        } catch (err) {
            handleError(res, err, 'Failed to load request');
        }
    });

    app.post('/api/requests/:requestId/approve', requireAdmin, async (req, res) => {
        try {
            await sendGateOrRun(req, res, async (config) => {
                const result = await requestAppService.approveRequest(config, req.params.requestId);
                await appendAuditLog('request_app_request_approved', req.user, null, { requestId: req.params.requestId, title: req.body?.title || '' });
                if (notifyRequestUpdate) {
                    void notifyRequestUpdate(config, {
                        requestedBy: req.body?.requestedBy || result?.requestedBy || null,
                        title: req.body?.title || result?.title || '',
                        statusLabel: 'approved',
                        requestId: req.params.requestId,
                    });
                }
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
                if (notifyRequestUpdate) {
                    void notifyRequestUpdate(config, {
                        requestedBy: req.body?.requestedBy || result?.requestedBy || null,
                        title: req.body?.title || result?.title || '',
                        statusLabel: 'declined',
                        requestId: req.params.requestId,
                    });
                }
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
