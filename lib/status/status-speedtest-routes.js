import { randomBytes } from 'crypto';

const SPEED_TEST_CHUNK_SIZE = 4 * 1024 * 1024;
const SPEED_TEST_BUFFER = randomBytes(SPEED_TEST_CHUNK_SIZE);
const SPEED_TEST_MAX_DOWNLOAD_BYTES = 512 * 1024 * 1024;
const SPEED_TEST_MAX_UPLOAD_BYTES = 4 * 1024 * 1024 * 1024;

export const registerStatusSpeedTestRoutes = ({
    app,
    requireAuth,
    requireMember,
    speedtestRateLimit,
}) => {
    app.get('/api/speedtest/ping', requireAuth, requireMember, speedtestRateLimit, (_req, res) => {
        res.set('Cache-Control', 'no-store');
        res.send('pong');
    });

    app.get('/api/speedtest/download', requireAuth, requireMember, speedtestRateLimit, (req, res) => {
        const streamForever = String(req.query.stream || '') === '1';
        const parsedBytes = parseInt(req.query.bytes, 10);
        const bytes = streamForever
            ? null
            : Math.max(1, Math.min(Number.isFinite(parsedBytes) ? parsedBytes : SPEED_TEST_CHUNK_SIZE, SPEED_TEST_MAX_DOWNLOAD_BYTES));

        res.set('Content-Type', 'application/octet-stream');
        res.set('Cache-Control', 'no-store, no-transform');
        res.set('Content-Encoding', 'identity');
        res.set('X-Content-Type-Options', 'nosniff');
        if (bytes != null) res.set('Content-Length', String(bytes));

        let destroyed = false;
        let sent = 0;
        const cleanup = () => { destroyed = true; };
        req.on('close', cleanup);
        res.on('close', cleanup);

        const pump = () => {
            if (destroyed || res.writableEnded) return;
            let ok = true;
            while (ok && !destroyed && !res.writableEnded) {
                if (bytes != null && sent >= bytes) {
                    res.end();
                    return;
                }
                const chunk = (bytes != null && (bytes - sent) < SPEED_TEST_CHUNK_SIZE)
                    ? SPEED_TEST_BUFFER.subarray(0, bytes - sent)
                    : SPEED_TEST_BUFFER;
                ok = res.write(chunk);
                sent += chunk.length;
            }
            if (!destroyed && !res.writableEnded) res.once('drain', pump);
        };

        pump();
    });

    app.post('/api/speedtest/upload', requireAuth, requireMember, speedtestRateLimit, (req, res) => {
        res.set('Cache-Control', 'no-store');
        let received = 0;
        req.on('data', (chunk) => {
            received += chunk.length;
            if (received > SPEED_TEST_MAX_UPLOAD_BYTES) {
                req.destroy();
                if (!res.headersSent) res.status(413).end();
            }
        });
        req.on('end', () => {
            if (!res.headersSent) res.sendStatus(200);
        });
        req.on('error', () => {
            if (!res.headersSent) res.sendStatus(499);
        });
    });
};
