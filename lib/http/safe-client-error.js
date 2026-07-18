/** Prefer stable client messages; keep intentional statusCode errors. */
export const clientErrorMessage = (error, fallback = 'Request failed.') => (
    error?.statusCode && error?.message ? String(error.message) : fallback
);
