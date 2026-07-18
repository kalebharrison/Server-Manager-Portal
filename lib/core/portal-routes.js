import { registerPortalAuthRoutes } from './portal-routes-auth.js';
import { registerPortalMediaRoutes } from './portal-routes-media.js';
import { registerPortalOpsRoutes } from './portal-routes-ops.js';

export const registerPortalRoutes = (ctx) => {
    registerPortalAuthRoutes(ctx);
    const mediaStackRoutes = registerPortalMediaRoutes(ctx);
    registerPortalOpsRoutes(ctx);
    return mediaStackRoutes;
};
