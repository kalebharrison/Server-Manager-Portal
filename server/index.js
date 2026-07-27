
import express from 'express';
import cookieParser from 'cookie-parser';
import compression from 'compression';
import { createBasePathHelpers, deriveBasePath } from '../lib/http/base-path.js';
import { resolveAppVersion } from '../lib/core/app-version.js';
import { loadPortalEnv } from '../lib/core/portal-env.js';
import { createSessionCookies } from '../lib/auth/session-cookies.js';
import { createSecurityHeadersMiddleware } from '../lib/http/http-security.js';
import { createCsrfOriginMiddleware } from '../lib/http/csrf-origin.js';
import { createPortalRuntime } from '../lib/core/create-portal-app.js';

const appVersion = resolveAppVersion();
const env = loadPortalEnv();

const app = express();
app.use(compression());

const BASE_PATH = deriveBasePath({ envBasePath: process.env.BASE_PATH, publicBaseUrl: env.PUBLIC_BASE_URL });
const { withBasePath, stripBasePathFromUrl } = createBasePathHelpers(BASE_PATH);

app.use(createSecurityHeadersMiddleware({ forceHsts: env.FORCE_SECURE_COOKIES }));

const { clearSessionCookie, setSessionCookie } = createSessionCookies({
    basePath: BASE_PATH,
    forceSecureCookies: env.FORCE_SECURE_COOKIES,
});

app.use(express.json({ limit: '50kb' }));
app.use(cookieParser());
app.use(createCsrfOriginMiddleware({ publicBaseUrl: env.PUBLIC_BASE_URL }));
app.set('trust proxy', 1);

if (BASE_PATH) {
    app.use((req, res, next) => {
        req.url = stripBasePathFromUrl(req.url);
        next();
    });
}

const { preparePortalStorage, startPortalService, log } = createPortalRuntime({
    app,
    appVersion,
    env,
    basePath: BASE_PATH,
    withBasePath,
    stripBasePathFromUrl,
    clearSessionCookie,
    setSessionCookie,
});

const startServer = async () => {
    try {
        await preparePortalStorage();
        app.listen(env.PORT, env.BIND_HOST, async (error) => {
            if (error) {
                log(`Failed to bind server on ${env.BIND_HOST}:${env.PORT}: ${error.message}`);
                process.exit(1);
            }
            try {
                await startPortalService();
            } catch (startupError) {
                log(`Startup failed: ${startupError.message}`);
                process.exit(1);
            }
        });
    } catch (e) {
        log(`Storage preparation failed: ${e.message}`);
        process.exit(1);
    }
};

void startServer();
