// Sentinel sent to the admin UI in place of stored secrets so raw credentials
// never leave the server. When the UI posts this value back unchanged on save,
// the existing stored secret is preserved instead of being overwritten.
export const SECRET_MASK = '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022';

export const loadPortalEnv = () => {
    const PORT = parseInt(process.env.PORT || '2121', 10);
    const BIND_HOST = process.env.BIND_HOST || '0.0.0.0';
    const SETUP_TOKEN = process.env.SETUP_TOKEN || '';
    const ALLOW_PRIVATE_INTEGRATION_URLS = String(process.env.ALLOW_PRIVATE_INTEGRATION_URLS || '').toLowerCase() === 'true';
    const FORCE_SECURE_COOKIES = String(process.env.FORCE_SECURE_COOKIES || '').toLowerCase() === 'true';
    const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || '';

    const JWT_SECRET = process.env.JWT_SECRET;
    if (!JWT_SECRET || JWT_SECRET.length < 32) {
        console.error('FATAL: JWT_SECRET environment variable must be set and at least 32 characters long.');
        console.error('Set it in a .env file or your process environment before starting the server.');
        process.exit(1);
    }
    const CONFIG_ENCRYPTION_KEY = process.env.CONFIG_ENCRYPTION_KEY || JWT_SECRET;
    if (CONFIG_ENCRYPTION_KEY.length < 32) {
        console.error('FATAL: CONFIG_ENCRYPTION_KEY must be at least 32 characters long.');
        process.exit(1);
    }

    const CLIENT_ID = process.env.CLIENT_ID || 'plex-expiry-manager-client-id';

    return {
        PORT,
        BIND_HOST,
        SETUP_TOKEN,
        ALLOW_PRIVATE_INTEGRATION_URLS,
        FORCE_SECURE_COOKIES,
        PUBLIC_BASE_URL,
        JWT_SECRET,
        CONFIG_ENCRYPTION_KEY,
        CLIENT_ID,
        SECRET_MASK,
    };
};
