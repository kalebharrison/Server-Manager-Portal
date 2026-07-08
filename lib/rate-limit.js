const defaultGetClientIp = (req) => req.ip || req.socket.remoteAddress || 'unknown';

export const createRateLimiter = ({
    windowMs,
    maxRequests,
    maxClients = 10000,
    getClientIp = defaultGetClientIp,
} = {}) => {
    const store = new Map();

    setInterval(() => {
        const now = Date.now();
        store.forEach((record, ip) => {
            if (now > record.resetAt) store.delete(ip);
        });
    }, windowMs).unref();

    return (req, res, next) => {
        const ip = getClientIp(req);
        const now = Date.now();
        const record = store.get(ip) || { count: 0, resetAt: now + windowMs };
        if (now > record.resetAt) {
            record.count = 0;
            record.resetAt = now + windowMs;
        }

        record.count++;
        if (!store.has(ip) && store.size >= maxClients) {
            const oldestIp = store.keys().next().value;
            if (oldestIp) store.delete(oldestIp);
        }
        store.set(ip, record);

        if (record.count > maxRequests) {
            return res.status(429).json({ error: 'Too many requests. Please try again later.' });
        }
        next();
    };
};
