import { portalUrl } from './basePath';

type ApiFetchOptions = RequestInit & {
    cacheTtlMs?: number;
    staleIfErrorMs?: number;
    cacheKey?: string;
    forceRefresh?: boolean;
};

const DEFAULT_GET_CACHE_TTL_MS = 5000;
const MAX_API_CACHE_ENTRIES = 100;
const apiCache = new Map<string, { expiresAt: number; staleUntil: number; value: any }>();
const inFlightRequests = new Map<string, Promise<any>>();
let cacheVersion = 0;

const methodFor = (options: RequestInit) => String(options.method || 'GET').toUpperCase();

const stableCacheKey = (url: string, options: ApiFetchOptions) => {
    if (options.cacheKey) return options.cacheKey;
    const headers = new Headers(options.headers || {});
    return `${methodFor(options)} ${portalUrl(url)} ${headers.get('accept') || ''}`;
};

export const clearApiCache = (predicate?: (key: string) => boolean) => {
    cacheVersion++;
    if (!predicate) {
        apiCache.clear();
        inFlightRequests.clear();
        return;
    }
    for (const key of apiCache.keys()) {
        if (predicate(key)) apiCache.delete(key);
    }
    for (const key of inFlightRequests.keys()) {
        if (predicate(key)) inFlightRequests.delete(key);
    }
};

export const apiFetch = async (url: string, options: ApiFetchOptions = {}) => {
    const { cacheTtlMs: requestedCacheTtlMs, staleIfErrorMs = 0, cacheKey: _cacheKey, forceRefresh, headers, ...fetchOptions } = options;
    const method = methodFor(options);
    const isGet = method === 'GET';
    const cacheTtlMs = requestedCacheTtlMs ?? (isGet ? DEFAULT_GET_CACHE_TTL_MS : 0);
    const cacheKey = stableCacheKey(url, options);
    const now = Date.now();
    const requestCacheVersion = cacheVersion;
    const cached = isGet ? apiCache.get(cacheKey) : undefined;

    if (isGet && cacheTtlMs > 0 && !forceRefresh) {
        if (cached && cached.expiresAt > now) {
            apiCache.delete(cacheKey);
            apiCache.set(cacheKey, cached);
            return cached.value;
        }
        if (cached && cached.staleUntil <= now) apiCache.delete(cacheKey);
        const pending = inFlightRequests.get(cacheKey);
        if (pending) return pending;
    }

    if (!isGet) clearApiCache();

    let request: Promise<any>;
    request = fetch(portalUrl(url), {
        ...fetchOptions,
        credentials: 'same-origin',
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            ...headers,
        },
    }).then(async (response) => {
        if (!response.ok) {
            // Auth loss must not keep serving prior-user GETs from memory.
            if (response.status === 401 || response.status === 403) clearApiCache();
            const errorData = await response.json().catch(() => ({ error: 'An unknown API error occurred.' }));
            throw new Error(errorData.error || `Request failed with status ${response.status}`);
        }
        if (response.status === 204) return;
        const value = await response.json();
        if (isGet && cacheTtlMs > 0 && requestCacheVersion === cacheVersion) {
            for (const [key, entry] of apiCache) {
                if (entry.staleUntil <= Date.now()) apiCache.delete(key);
            }
            while (apiCache.size >= MAX_API_CACHE_ENTRIES) {
                const oldestKey = apiCache.keys().next().value;
                if (!oldestKey) break;
                apiCache.delete(oldestKey);
            }
            apiCache.set(cacheKey, {
                expiresAt: Date.now() + cacheTtlMs,
                staleUntil: Date.now() + cacheTtlMs + Math.max(0, staleIfErrorMs),
                value,
            });
        }
        return value;
    }).catch((error) => {
        if (isGet && requestCacheVersion === cacheVersion && cached && cached.staleUntil > Date.now()) return cached.value;
        throw error;
    }).finally(() => {
        if (inFlightRequests.get(cacheKey) === request) inFlightRequests.delete(cacheKey);
    });

    if (isGet && cacheTtlMs > 0) inFlightRequests.set(cacheKey, request);
    return request;
};
