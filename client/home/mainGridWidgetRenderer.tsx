import type { MainGridWidgetId } from '../shared/dashboardLayout';
import type { MainGridWidgetDeps } from './userDashboardWidgetTypes';
import { renderAccessStatusWidget } from './widgets/accessStatusWidgets';
import { renderEngagementWidget } from './widgets/engagementWidgets';
import { renderLibraryAnalyticsWidget } from './widgets/libraryAnalyticsWidgets';
import { buildWidgetContext } from './widgets/shared';

export const createMainGridWidgetRenderer = (deps: MainGridWidgetDeps) => {
    const ctx = buildWidgetContext(deps);

    return (id: MainGridWidgetId) => (
        renderAccessStatusWidget(id, deps, ctx)
        ?? renderEngagementWidget(id, deps, ctx)
        ?? renderLibraryAnalyticsWidget(id, deps, ctx)
        ?? null
    );
};
