import express from 'express';

import { SPEED_TEST_BUFFER, SPEED_TEST_CHUNK_SIZE } from './status-monitor.js';

export const registerSpeedtestRoutes = ({
    app,
    requireAuth,
    requireMember,
    speedtestRateLimit,
}) => {
    app.get('/api/speedtest/ping', requireAuth, requireMember, speedtestRateLimit, (req, res) => { res.set('Cache-Control', 'no-store'); res.send('pong'); });
    app.get('/api/speedtest/download', requireAuth, requireMember, speedtestRateLimit, (req, res) => {
        const parsedBytes = parseInt(req.query.bytes, 10) || SPEED_TEST_CHUNK_SIZE;
        const bytes = Math.max(1, Math.min(parsedBytes, 10 * 1024 * 1024));
        res.set('Content-Type', 'application/octet-stream');
        res.set('Content-Length', bytes);
        res.set('Cache-Control', 'no-store');
        let sent = 0;
        const streamData = () => {
            if (sent >= bytes) return res.end();
            const remaining = bytes - sent;
            const chunk = remaining >= SPEED_TEST_CHUNK_SIZE ? SPEED_TEST_BUFFER : SPEED_TEST_BUFFER.subarray(0, remaining);
            const canContinue = res.write(chunk);
            sent += chunk.length;
            if (canContinue) setImmediate(streamData);
            else res.once('drain', streamData);
        };
        streamData();
    });
    app.post('/api/speedtest/upload', requireAuth, requireMember, speedtestRateLimit, express.raw({ type: '*/*', limit: '10mb' }), (req, res) => res.sendStatus(200));

};
