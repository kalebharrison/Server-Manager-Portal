import { normalized } from './deleted-users.js';

const stableJson = (value) => {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
};

export const registerMaintenanceReadRoutes = ({
    app,
    requireAdmin,
    configPath,
    maintenanceRulesPath,
    maintenanceMediaIndexPath,
    maintenanceRequestIndexPath,
    maintenanceRunsPath,
    loadFile,
    saveFile,
    maintenanceService,
    cachedMaintenanceRead,
    bumpMaintenanceCache,
}) => {
    const {
        MAINTENANCE_FILTER_CATALOG,
        loadMaintenancePreferences,
        applyMaintenanceExclusions,
        sanitizeMaintenanceRuleForPersist,
        buildMaintenancePreviewForRule,
        evaluateMaintenanceRule,
        getArrCatalog,
        validateMaintenanceDestructivePreflight,
        buildMaintenanceMediaIndex,
    } = maintenanceService;

    app.get('/api/maintenance/filter-options', requireAdmin, async (req, res) => {
        res.json({
            fields: MAINTENANCE_FILTER_CATALOG,
            operators: ['equals', 'not_equals', 'contains', 'not_contains', 'greater_than', 'less_than', 'between', 'in', 'not_in', 'is_empty', 'not_empty', 'regex'],
            groupLogic: ['AND', 'OR', 'NOT']
        });
    });

    app.get('/api/maintenance/rules', requireAdmin, async (req, res) => {
        try {
            const rules = await cachedMaintenanceRead('rules', 5000, 'all', async () => {
                const storedRules = await loadFile(maintenanceRulesPath, []);
                const source = Array.isArray(storedRules) ? storedRules : [];
                let changed = false;
                const nextRules = source.map((rule) => {
                    const graceDays = Math.max(0, Number(rule?.graceDays || 0));
                    const createdAt = rule?.createdAt || new Date().toISOString();
                    if (graceDays !== Number(rule?.graceDays || 0) || !rule?.createdAt) changed = true;
                    return {
                        ...sanitizeMaintenanceRuleForPersist(rule),
                        graceDays,
                        createdAt
                    };
                });
                if (changed) await saveFile(maintenanceRulesPath, nextRules);
                return nextRules;
            });
            res.json(rules);
        } catch (e) {
            res.status(500).json({ error: `Failed to load maintenance rules: ${e.message}` });
        }
    });

    app.post('/api/maintenance/index/rebuild', requireAdmin, async (req, res) => {
        try {
            const payload = await buildMaintenanceMediaIndex({ actor: req.user, force: true });
            bumpMaintenanceCache();
            res.json({ success: true, generatedAt: payload.generatedAt, itemCount: payload.itemCount, requestItemCount: payload.requestItemCount });
        } catch (e) {
            res.status(500).json({ error: `Failed to rebuild maintenance index: ${e.message}` });
        }
    });

    app.get('/api/maintenance/index', requireAdmin, async (req, res) => {
        try {
            const response = await cachedMaintenanceRead('index', 5000, 'summary', async () => {
                const payload = await loadFile(maintenanceMediaIndexPath, { generatedAt: null, itemCount: 0, items: [] });
                const requestIndex = await loadFile(maintenanceRequestIndexPath, { generatedAt: null, items: [] });
                return {
                    generatedAt: payload.generatedAt || null,
                    itemCount: payload.itemCount || 0,
                    requestGeneratedAt: requestIndex.generatedAt || null,
                    requestItemCount: Array.isArray(requestIndex.items) ? requestIndex.items.length : 0
                };
            });
            res.json(response);
        } catch (e) {
            res.status(500).json({ error: `Failed to load maintenance index: ${e.message}` });
        }
    });

    app.get('/api/maintenance/library-items', requireAdmin, async (req, res) => {
        try {
            const libraryId = String(req.query.libraryId || 'all');
            const search = normalized(String(req.query.search || ''));
            const page = Math.max(1, Number(req.query.page || 1));
            const limit = Math.min(120, Math.max(12, Number(req.query.limit || 48)));
            const includeExcluded = String(req.query.includeExcluded || 'true') !== 'false';
            const response = await cachedMaintenanceRead('library-items', 10000, stableJson({ libraryId, search, page, limit, includeExcluded }), async () => {
                const payload = await loadFile(maintenanceMediaIndexPath, { generatedAt: null, items: [] });
                const preferences = await loadMaintenancePreferences();
                const allItems = Array.isArray(payload.items) ? payload.items : [];

                const excludedKeys = new Set((preferences?.exclusions?.ratingKeys || []).map(v => String(v)));
                const excludedTitles = new Set((preferences?.exclusions?.titles || []).map(v => normalized(v)));
                const excludedLibraries = new Set((preferences?.exclusions?.libraries || []).map(v => normalized(v)));

                const librariesMap = allItems.reduce((acc, item) => {
                    const key = String(item?.libraryId || '');
                    if (!key) return acc;
                    if (!acc[key]) {
                        acc[key] = { id: key, title: item?.libraryTitle || `Library ${key}`, count: 0 };
                    }
                    acc[key].count += 1;
                    return acc;
                }, {});

                const filtered = allItems
                    .filter((item) => {
                        if (!item) return false;
                        if (libraryId !== 'all' && String(item.libraryId || '') !== libraryId) return false;
                        if (search && !normalized(item.title).includes(search)) return false;
                        return true;
                    })
                    .map((item) => {
                        const excluded = excludedKeys.has(String(item.ratingKey || ''))
                            || excludedTitles.has(normalized(item.title))
                            || excludedLibraries.has(normalized(item.libraryTitle));
                        return {
                            ratingKey: String(item.ratingKey || ''),
                            title: item.title || 'Unknown',
                            thumb: item.thumb || '',
                            year: item.year || null,
                            libraryId: String(item.libraryId || ''),
                            libraryTitle: item.libraryTitle || 'Library',
                            watchCount: Number(item.watchCount || 0),
                            sizeGB: Number(item.sizeGB || 0),
                            lastViewedAt: item.lastViewedAt || null,
                            excluded
                        };
                    })
                    .filter(item => includeExcluded ? true : !item.excluded)
                    .sort((a, b) => String(a.title || '').localeCompare(String(b.title || ''), undefined, { sensitivity: 'base' }));

                const start = (page - 1) * limit;
                const pageItems = filtered.slice(start, start + limit);
                return {
                    generatedAt: payload.generatedAt || null,
                    total: filtered.length,
                    page,
                    limit,
                    libraries: Object.values(librariesMap).sort((a, b) => String(a.title).localeCompare(String(b.title), undefined, { sensitivity: 'base' })),
                    items: pageItems
                };
            });
            res.json(response);
        } catch (e) {
            res.status(500).json({ error: `Failed to load maintenance library items: ${e.message}` });
        }
    });

    app.get('/api/maintenance/storage-summary', requireAdmin, async (req, res) => {
        try {
            const requestedRuleId = String(req.query.ruleId || '').trim();
            const response = await cachedMaintenanceRead('storage-summary', 10000, requestedRuleId || 'all', async () => {
                const payload = await loadFile(maintenanceMediaIndexPath, { generatedAt: null, items: [] });
                const preferences = await loadMaintenancePreferences();
                const rules = await loadFile(maintenanceRulesPath, []);
                const allItems = Array.isArray(payload.items) ? payload.items : [];
                const usableItems = applyMaintenanceExclusions(allItems, preferences);

                const selectedRules = requestedRuleId
                    ? rules.filter((r) => String(r.id || '') === requestedRuleId)
                    : rules.filter((r) => r?.enabled !== false);

                const matched = selectedRules.length
                    ? usableItems.filter((item) => selectedRules.some((rule) => evaluateMaintenanceRule(item, rule)))
                    : [];
                const matchedKeys = new Set(matched.map((item) => String(item?.ratingKey || '')));

                const libraries = {};
                allItems.forEach((item) => {
                    const libId = String(item?.libraryId || '');
                    const libName = item?.libraryTitle || `Library ${libId || 'Unknown'}`;
                    if (!libraries[libName]) {
                        libraries[libName] = {
                            libraryId: libId,
                            libraryTitle: libName,
                            totalItems: 0,
                            totalSizeGB: 0,
                            matchedItems: 0,
                            reclaimGB: 0,
                            afterSizeGB: 0,
                            reclaimPercent: 0
                        };
                    }
                    const size = Number(item?.sizeGB || 0);
                    libraries[libName].totalItems += 1;
                    libraries[libName].totalSizeGB += size;
                    if (matchedKeys.has(String(item?.ratingKey || ''))) {
                        libraries[libName].matchedItems += 1;
                        libraries[libName].reclaimGB += size;
                    }
                });

                const libraryRows = Object.values(libraries).map((lib) => {
                    const after = Math.max(0, Number(lib.totalSizeGB || 0) - Number(lib.reclaimGB || 0));
                    const percent = Number(lib.totalSizeGB || 0) > 0 ? ((Number(lib.reclaimGB || 0) / Number(lib.totalSizeGB || 0)) * 100) : 0;
                    return {
                        ...lib,
                        totalSizeGB: Math.round(Number(lib.totalSizeGB || 0) * 100) / 100,
                        reclaimGB: Math.round(Number(lib.reclaimGB || 0) * 100) / 100,
                        afterSizeGB: Math.round(after * 100) / 100,
                        reclaimPercent: Math.round(percent * 100) / 100
                    };
                }).sort((a, b) => b.reclaimGB - a.reclaimGB);

                const totalBeforeGB = libraryRows.reduce((sum, row) => sum + Number(row.totalSizeGB || 0), 0);
                const totalReclaimGB = libraryRows.reduce((sum, row) => sum + Number(row.reclaimGB || 0), 0);
                const totalAfterGB = Math.max(0, totalBeforeGB - totalReclaimGB);

                return {
                    generatedAt: new Date().toISOString(),
                    indexGeneratedAt: payload.generatedAt || null,
                    selectedRuleId: requestedRuleId || null,
                    rulesConsidered: selectedRules.map((r) => ({ id: r.id, name: r.name || 'Unnamed Rule' })),
                    totals: {
                        libraries: libraryRows.length,
                        items: allItems.length,
                        matchedItems: matched.length,
                        beforeGB: Math.round(totalBeforeGB * 100) / 100,
                        reclaimGB: Math.round(totalReclaimGB * 100) / 100,
                        afterGB: Math.round(totalAfterGB * 100) / 100,
                        reclaimPercent: totalBeforeGB > 0 ? Math.round((totalReclaimGB / totalBeforeGB) * 10000) / 100 : 0
                    },
                    libraries: libraryRows
                };
            });
            res.json(response);
        } catch (e) {
            res.status(500).json({ error: `Failed to load maintenance storage summary: ${e.message}` });
        }
    });

    app.post('/api/maintenance/preview', requireAdmin, async (req, res) => {
        try {
            const { ruleId, rule, limit = 300, includeAll = false, includeArrDiagnostics = false } = req.body || {};
            const response = await cachedMaintenanceRead('preview', includeArrDiagnostics ? 5000 : 10000, stableJson({ ruleId, rule, limit, includeAll, includeArrDiagnostics }), async () => {
                const config = await loadFile(configPath, {});
                const rules = await loadFile(maintenanceRulesPath, []);
                const payload = await loadFile(maintenanceMediaIndexPath, { items: [] });
                const preferences = await loadMaintenancePreferences();
                const allItems = Array.isArray(payload.items) ? payload.items : [];
                const selectedRules = rule
                    ? [rule]
                    : (ruleId ? rules.filter(r => r.id === ruleId) : rules.filter(r => r.enabled !== false));
                const catalog = includeArrDiagnostics ? await getArrCatalog(config) : null;
                const previews = selectedRules.map((selectedRule) => buildMaintenancePreviewForRule(
                    selectedRule,
                    allItems,
                    preferences,
                    catalog,
                    { limit, includeAll }
                ));
                return {
                    generatedAt: new Date().toISOString(),
                    indexGeneratedAt: payload.generatedAt || null,
                    preferences,
                    arrDiagnostics: includeArrDiagnostics ? {
                        radarrCount: catalog?.radarr?.length || 0,
                        sonarrCount: catalog?.sonarr?.length || 0,
                        radarrConfigured: !!(config.radarrUrl && config.radarrApiKey),
                        sonarrConfigured: !!(config.sonarrUrl && config.sonarrApiKey)
                    } : null,
                    previews
                };
            });
            res.json(response);
        } catch (e) {
            res.status(500).json({ error: `Failed to generate maintenance preview: ${e.message}` });
        }
    });

    app.post('/api/maintenance/preflight', requireAdmin, async (req, res) => {
        try {
            const ruleId = String(req.body?.ruleId || '').trim();
            if (!ruleId) return res.status(400).json({ error: 'ruleId is required.' });
            const config = await loadFile(configPath, {});
            const rules = await loadFile(maintenanceRulesPath, []);
            const rule = (Array.isArray(rules) ? rules : []).find((r) => String(r?.id || '') === ruleId);
            if (!rule) return res.status(404).json({ error: 'Maintenance rule not found.' });
            const catalog = await getArrCatalog(config);
            const preflight = await validateMaintenanceDestructivePreflight(config, rule, catalog);
            const preferences = await loadMaintenancePreferences();
            const indexPayload = await loadFile(maintenanceMediaIndexPath, { items: [] });
            const preview = buildMaintenancePreviewForRule(
                rule,
                Array.isArray(indexPayload.items) ? indexPayload.items : [],
                preferences,
                catalog,
                { limit: 5, includeAll: false }
            );
            res.json({
                ...preflight,
                preview: {
                    totalMatches: preview.totalMatches,
                    eligibleCount: preview.eligibleCount,
                    inGraceCount: preview.inGraceCount,
                    graceRemainingDays: preview.graceRemainingDays,
                    actionableCount: preview.actionableCount,
                    unactionableCount: preview.unactionableCount,
                    wouldProcessCount: preview.wouldProcessCount,
                    maxActionsPerRun: preview.maxActionsPerRun
                },
                arrCatalog: {
                    radarrCount: catalog.radarr.length,
                    sonarrCount: catalog.sonarr.length
                }
            });
        } catch (e) {
            res.status(500).json({ error: `Failed maintenance preflight: ${e.message}` });
        }
    });

    app.get('/api/maintenance/preferences', requireAdmin, async (req, res) => {
        try {
            const prefs = await cachedMaintenanceRead('preferences', 5000, 'all', loadMaintenancePreferences);
            res.json(prefs);
        } catch (e) {
            res.status(500).json({ error: `Failed to load maintenance preferences: ${e.message}` });
        }
    });

    app.get('/api/maintenance/exclusions/summary', requireAdmin, async (req, res) => {
        try {
            const response = await cachedMaintenanceRead('exclusions-summary', 10000, 'all', async () => {
                const prefs = await loadMaintenancePreferences();
                const payload = await loadFile(maintenanceMediaIndexPath, { generatedAt: null, items: [] });
                const allItems = Array.isArray(payload.items) ? payload.items : [];

                const byRatingKey = new Map(allItems.map((item) => [String(item?.ratingKey || ''), item]));
                const byNormalizedTitle = new Map();
                allItems.forEach((item) => {
                    const key = normalized(item?.title || '');
                    if (!key) return;
                    if (!byNormalizedTitle.has(key)) byNormalizedTitle.set(key, []);
                    byNormalizedTitle.get(key).push(item);
                });

                const ratingKeyEntries = (prefs?.exclusions?.ratingKeys || []).map((ratingKey) => {
                    const key = String(ratingKey || '');
                    const item = byRatingKey.get(key);
                    return {
                        ratingKey: key,
                        found: !!item,
                        title: item?.title || '(Missing from current index)',
                        libraryTitle: item?.libraryTitle || '',
                        thumb: item?.thumb || ''
                    };
                });

                const titleEntries = (prefs?.exclusions?.titles || []).map((title) => {
                    const key = normalized(title || '');
                    const matches = byNormalizedTitle.get(key) || [];
                    const sample = matches[0] || null;
                    return {
                        title: String(title || ''),
                        matchCount: matches.length,
                        sampleTitle: sample?.title || null,
                        sampleLibraryTitle: sample?.libraryTitle || null,
                        sampleThumb: sample?.thumb || null
                    };
                });

                const libraryEntries = (prefs?.exclusions?.libraries || []).map((library) => {
                    const normalizedLibrary = normalized(library || '');
                    const count = allItems.filter((item) => normalized(item?.libraryTitle || '') === normalizedLibrary).length;
                    return {
                        libraryTitle: String(library || ''),
                        matchCount: count
                    };
                });

                return {
                    generatedAt: payload.generatedAt || null,
                    ratingKeys: ratingKeyEntries,
                    titles: titleEntries,
                    libraries: libraryEntries
                };
            });
            res.json(response);
        } catch (e) {
            res.status(500).json({ error: `Failed to load exclusions summary: ${e.message}` });
        }
    });

    app.get('/api/maintenance/runs', requireAdmin, async (req, res) => {
        try {
            const runs = await cachedMaintenanceRead('runs', 5000, 'all', async () => loadFile(maintenanceRunsPath, []));
            res.json(Array.isArray(runs) ? runs : []);
        } catch (e) {
            res.status(500).json({ error: `Failed to load maintenance runs: ${e.message}` });
        }
    });
};
