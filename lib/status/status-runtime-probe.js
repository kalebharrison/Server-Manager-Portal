import http from 'http';
import https from 'https';

export const createStatusServiceProbe = ({
    port,
    basePath,
    resolveIntegrationUrlForFetch,
    resolveServiceUrl,
    probeService,
}) => {
    return async (service) => {
        if (probeService) {
            try {
                const result = await probeService(service);
                if (result) return result;
            } catch {
                return { status: 'offline', latency: 0, httpCode: 0 };
            }
        }
        let resolvedUrl = '';
        if (resolveServiceUrl) {
            try {
                resolvedUrl = await resolveServiceUrl(service);
            } catch { /* fall back to the configured URL */ }
        }
        const rawUrl = service.id === 'portal'
            ? `http://127.0.0.1:${port}${basePath}/api/health`
            : (resolvedUrl || service.url);
        if (!rawUrl) return { status: 'offline', latency: 0, httpCode: 0 };

        let targetUrl = rawUrl;
        if (service.id !== 'portal') {
            try {
                targetUrl = await resolveIntegrationUrlForFetch(rawUrl);
            } catch {
                return { status: 'offline', latency: 0, httpCode: 0 };
            }
        }
        if (!targetUrl) return { status: 'offline', latency: 0, httpCode: 0 };

        if (service.port) {
            try {
                const u = new URL(targetUrl);
                u.port = service.port;
                targetUrl = u.toString();
            } catch (e) { /* keep original */ }
        }

        let parsedUrl;
        try {
            parsedUrl = new URL(targetUrl);
        } catch (e) {
            return { status: 'offline', latency: 0, httpCode: 0 };
        }

        const lib = parsedUrl.protocol === 'https:' ? https : http;
        const start = Date.now();

        return new Promise((resolve) => {
            const request = lib.get(targetUrl, {
                headers: { 'User-Agent': 'SubZero-Monitor/1.0', 'Cache-Control': 'no-cache', 'Connection': 'close' },
                timeout: 8000,
                rejectUnauthorized: true
            }, (response) => {
                response.resume();
                const latency = Math.round(Date.now() - start);
                const code = response.statusCode || 0;
                let status = (code >= 200 && code < 400) || code === 401 || code === 403 ? 'online' : (code >= 500 ? 'degraded' : 'offline');
                resolve({ status, latency, httpCode: code });
            });

            request.on('error', () => resolve({ status: 'offline', latency: 0, httpCode: 0 }));
            request.on('timeout', () => { request.destroy(); resolve({ status: 'offline', latency: 0, httpCode: 408 }); });
        });
    };
};
