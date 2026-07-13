import { randomUUID } from 'crypto';

export const registerMaintenanceMutationRoutes = ({
    app,
    requireAdmin,
    maintenanceRulesPath,
    maintenancePrefsPath,
    loadFile,
    saveFile,
    appendAuditLog,
    maintenanceService,
    tasksInfo,
    markTaskStart,
    markTaskEnd,
    bumpMaintenanceCache,
}) => {
    const {
        MAINTENANCE_PREFS_DEFAULTS,
        maintenanceRunState,
        sanitizeMaintenanceRuleForPersist,
        getMaintenanceSettings,
        executeMaintenanceRunBatch,
    } = maintenanceService;

    app.post('/api/maintenance/rules', requireAdmin, async (req, res) => {
        try {
            const rules = req.body;
            if (!Array.isArray(rules)) return res.status(400).json({ error: 'Rules must be an array.' });
            const existingRules = await loadFile(maintenanceRulesPath, []);
            const existingById = new Map((Array.isArray(existingRules) ? existingRules : []).map((rule) => [String(rule?.id || ''), rule]));
            const normalized = rules.map((rule) => {
                const cleaned = sanitizeMaintenanceRuleForPersist(rule);
                const currentId = String(cleaned?.id || '');
                const prev = existingById.get(currentId);
                const resetGrace = !!rule?._resetGrace;
                return {
                    ...cleaned,
                    id: cleaned.id || randomUUID(),
                    name: cleaned.name || 'Unnamed Rule',
                    enabled: cleaned.enabled !== false,
                    graceDays: Math.max(0, Number(cleaned?.graceDays || 0)),
                    createdAt: resetGrace
                        ? new Date().toISOString()
                        : (prev?.createdAt || cleaned?.createdAt || new Date().toISOString()),
                    updatedAt: new Date().toISOString(),
                    settings: getMaintenanceSettings(cleaned)
                };
            });
            await saveFile(maintenanceRulesPath, normalized);
            await appendAuditLog('maintenance_rules_updated', req.user, null, { count: normalized.length });
            bumpMaintenanceCache();
            res.json({ success: true, rules: normalized });
        } catch (e) {
            res.status(500).json({ error: `Failed to save maintenance rules: ${e.message}` });
        }
    });

    app.post('/api/maintenance/rules/reset-grace', requireAdmin, async (req, res) => {
        try {
            const ruleId = String(req.body?.ruleId || '').trim();
            if (!ruleId) return res.status(400).json({ error: 'ruleId is required.' });
            const rules = await loadFile(maintenanceRulesPath, []);
            const source = Array.isArray(rules) ? rules : [];
            let found = false;
            const resetAt = new Date().toISOString();
            const updated = source.map((rule) => {
                if (String(rule?.id || '') !== ruleId) return sanitizeMaintenanceRuleForPersist(rule);
                found = true;
                return {
                    ...sanitizeMaintenanceRuleForPersist(rule),
                    createdAt: resetAt,
                    updatedAt: resetAt
                };
            });
            if (!found) return res.status(404).json({ error: 'Maintenance rule not found.' });
            await saveFile(maintenanceRulesPath, updated);
            await appendAuditLog('maintenance_grace_reset', req.user, null, { ruleId, resetAt });
            bumpMaintenanceCache();
            res.json({ success: true, ruleId, createdAt: resetAt });
        } catch (e) {
            res.status(500).json({ error: `Failed to reset maintenance grace timer: ${e.message}` });
        }
    });

    app.post('/api/maintenance/preferences', requireAdmin, async (req, res) => {
        try {
            const body = req.body || {};
            const next = {
                global: {
                    dryRunByDefault: body?.global?.dryRunByDefault !== undefined ? !!body.global.dryRunByDefault : MAINTENANCE_PREFS_DEFAULTS.global.dryRunByDefault,
                    maxActionsPerRun: Math.max(1, Number(body?.global?.maxActionsPerRun || MAINTENANCE_PREFS_DEFAULTS.global.maxActionsPerRun)),
                    requireConfirmForDestructive: body?.global?.requireConfirmForDestructive !== undefined ? !!body.global.requireConfirmForDestructive : MAINTENANCE_PREFS_DEFAULTS.global.requireConfirmForDestructive
                },
                exclusions: {
                    ratingKeys: Array.isArray(body?.exclusions?.ratingKeys) ? body.exclusions.ratingKeys.map(v => String(v)) : [],
                    titles: Array.isArray(body?.exclusions?.titles) ? body.exclusions.titles.map(v => String(v)) : [],
                    libraries: Array.isArray(body?.exclusions?.libraries) ? body.exclusions.libraries.map(v => String(v)) : []
                }
            };
            await saveFile(maintenancePrefsPath, next);
            await appendAuditLog('maintenance_preferences_updated', req.user, null, {
                titleExclusions: next.exclusions.titles.length,
                libraryExclusions: next.exclusions.libraries.length,
                keyExclusions: next.exclusions.ratingKeys.length
            });
            bumpMaintenanceCache();
            res.json({ success: true, preferences: next });
        } catch (e) {
            res.status(500).json({ error: `Failed to save maintenance preferences: ${e.message}` });
        }
    });

    app.post('/api/maintenance/run', requireAdmin, async (req, res) => {
        if (maintenanceRunState.running) {
            return res.status(409).json({ error: 'A maintenance run is already in progress.' });
        }
        const task = tasksInfo.find(t => t.id === 'maintenanceRuleRun');
        try {
            const { ruleId, dryRun, confirmToken, runOptions } = req.body || {};
            maintenanceRunState.running = true;
            maintenanceRunState.lastRunAt = new Date().toISOString();
            maintenanceRunState.lastError = null;
            if (task) markTaskStart(task);
            const newRuns = await executeMaintenanceRunBatch({ actor: req.user, ruleId, dryRun, confirmToken, runOptions });
            if (task) {
                task.nextRun = null;
                markTaskEnd(task, null);
            }
            maintenanceRunState.running = false;
            await appendAuditLog('maintenance_run_completed', req.user, null, {
                runCount: newRuns.length,
                dryRun: dryRun !== false
            });
            bumpMaintenanceCache();
            res.json({ success: true, runs: newRuns });
        } catch (e) {
            maintenanceRunState.running = false;
            maintenanceRunState.lastError = e.message;
            if (task) markTaskEnd(task, e);
            res.status(500).json({ error: `Maintenance run failed: ${e.message}` });
        }
    });
};
