import { portalUrl } from './basePath';

type ApiFetchOptions = RequestInit & {
    cacheTtlMs?: number;
    cacheKey?: string;
    forceRefresh?: boolean;
};

const DEFAULT_GET_CACHE_TTL_MS = 5000;
const apiCache = new Map<string, { expiresAt: number; value: any }>();
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
    const { cacheTtlMs: requestedCacheTtlMs, cacheKey: _cacheKey, forceRefresh, headers, ...fetchOptions } = options;
    const method = methodFor(options);
    const isGet = method === 'GET';
    const cacheTtlMs = requestedCacheTtlMs ?? (isGet ? DEFAULT_GET_CACHE_TTL_MS : 0);
    const cacheKey = stableCacheKey(url, options);
    const now = Date.now();
    const requestCacheVersion = cacheVersion;

    if (isGet && cacheTtlMs > 0 && !forceRefresh) {
        const cached = apiCache.get(cacheKey);
        if (cached && cached.expiresAt > now) return cached.value;
        const pending = inFlightRequests.get(cacheKey);
        if (pending) return pending;
    }

    if (!isGet) clearApiCache();

    const request = fetch(portalUrl(url), {
        ...fetchOptions,
        credentials: 'same-origin',
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            ...headers,
        },
    }).then(async (response) => {
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'An unknown API error occurred.' }));
            throw new Error(errorData.error || `Request failed with status ${response.status}`);
        }
        if (response.status === 204) return;
        const value = await response.json();
        if (isGet && cacheTtlMs > 0 && requestCacheVersion === cacheVersion) {
            apiCache.set(cacheKey, { expiresAt: Date.now() + cacheTtlMs, value });
        }
        return value;
    }).finally(() => {
        inFlightRequests.delete(cacheKey);
    });

    if (isGet && cacheTtlMs > 0) inFlightRequests.set(cacheKey, request);
    return request;
};
