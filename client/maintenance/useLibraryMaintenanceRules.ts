import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../shared/api';
import { appConfirm } from '../shared/confirm';
import {
    createMaintenanceRule,
    formatMaintenanceRunSummary,
    snapshotMaintenanceRules,
    stripMaintenanceRuleTransientFields,
    type MaintenanceField,
    type MaintenanceIndexInfo,
    type MaintenancePreview,
    type MaintenanceRule
} from './maintenanceRuleModels';

type AddToast = (message: string, type?: 'success' | 'error') => void;

type Options = {
    addToast: AddToast;
    onRulesUpdated?: () => void;
};

type PreviewResponse = { previews?: MaintenancePreview[] };
type RunResponse = { runs?: Array<{ totals?: Record<string, number> }> };
type PreflightResponse = {
    ok: boolean;
    errors?: string[];
    warnings?: string[];
    preview?: {
        wouldProcessCount: number;
        actionableCount: number;
        unactionableCount: number;
        graceRemainingDays: number;
        inGraceCount: number;
    };
};

export const useLibraryMaintenanceRules = ({ addToast, onRulesUpdated }: Options) => {
    const [fields, setFields] = useState<MaintenanceField[]>([]);
    const [rules, setRules] = useState<MaintenanceRule[]>([]);
    const [savedRulesSnapshot, setSavedRulesSnapshot] = useState('');
    const [previewData, setPreviewData] = useState<MaintenancePreview[]>([]);
    const [indexInfo, setIndexInfo] = useState<MaintenanceIndexInfo | null>(null);
    const [selectedRuleId, setSelectedRuleId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [runningRuleId, setRunningRuleId] = useState<string | null>(null);
    const [previewRuleId, setPreviewRuleId] = useState<string | null>(null);
    const [resettingRuleId, setResettingRuleId] = useState<string | null>(null);
    const [togglingRuleId, setTogglingRuleId] = useState<string | null>(null);
    const [pinCollectionOnDestructiveRun, setPinCollectionOnDestructiveRun] = useState(false);

    const selectedRule = useMemo(
        () => rules.find((rule) => rule.id === selectedRuleId) || null,
        [rules, selectedRuleId]
    );
    const previewByRuleId = useMemo(
        () => new Map(previewData.map((preview) => [preview.ruleId, preview])),
        [previewData]
    );
    const selectedPreview = useMemo(
        () => selectedRuleId ? previewByRuleId.get(selectedRuleId) || null : null,
        [previewByRuleId, selectedRuleId]
    );

    const refreshRules = useCallback(async () => {
        const data = await apiFetch('/api/maintenance/rules');
        const normalized = Array.isArray(data) ? data as MaintenanceRule[] : [];
        setRules(normalized);
        setSavedRulesSnapshot(snapshotMaintenanceRules(normalized));
        setSelectedRuleId((currentRuleId) => {
            if (!currentRuleId) return null;
            return normalized.some((rule) => rule.id === currentRuleId) ? currentRuleId : null;
        });
    }, []);

    const isRuleDirty = useCallback((ruleId: string) => {
        if (!savedRulesSnapshot) return false;
        try {
            const savedRule = (JSON.parse(savedRulesSnapshot) as MaintenanceRule[]).find((rule) => rule.id === ruleId);
            const currentRule = rules.find((rule) => rule.id === ruleId);
            if (!savedRule || !currentRule) return !!currentRule;
            return JSON.stringify(savedRule) !== JSON.stringify(stripMaintenanceRuleTransientFields(currentRule));
        } catch {
            return false;
        }
    }, [rules, savedRulesSnapshot]);

    const loadAll = useCallback(async () => {
        setLoading(true);
        try {
            const [catalog, preview, index] = await Promise.all([
                apiFetch('/api/maintenance/filter-options'),
                apiFetch('/api/maintenance/preview', {
                    method: 'POST',
                    body: JSON.stringify({ includeAll: false, limit: 40, includeArrDiagnostics: false })
                }),
                apiFetch('/api/maintenance/index')
            ]);
            setFields(Array.isArray(catalog?.fields) ? catalog.fields : []);
            setPreviewData(Array.isArray((preview as PreviewResponse)?.previews) ? (preview as PreviewResponse).previews || [] : []);
            setIndexInfo(index as MaintenanceIndexInfo);
            await refreshRules();
        } catch (error: any) {
            addToast(error.message || 'Failed to load maintenance module', 'error');
        } finally {
            setLoading(false);
        }
    }, [addToast, refreshRules]);

    useEffect(() => { loadAll(); }, [loadAll]);

    const updateRule = useCallback((nextRule: MaintenanceRule) => {
        setRules((currentRules) => currentRules.map((rule) => rule.id === nextRule.id ? nextRule : rule));
    }, []);

    const addRule = useCallback(() => {
        const nextRule = createMaintenanceRule();
        setRules((currentRules) => [...currentRules, nextRule]);
        setSelectedRuleId(nextRule.id);
    }, []);

    const removeRuleLocally = useCallback((ruleId: string) => {
        setRules((currentRules) => {
            const remainingRules = currentRules.filter((rule) => rule.id !== ruleId);
            setSelectedRuleId((currentRuleId) => currentRuleId === ruleId ? remainingRules[0]?.id || null : currentRuleId);
            return remainingRules;
        });
        setPreviewData((currentPreviews) => currentPreviews.filter((preview) => preview.ruleId !== ruleId));
    }, []);

    const deleteRule = useCallback((ruleId: string) => {
        const target = rules.find((rule) => rule.id === ruleId);
        if (!target) return;
        appConfirm(`Delete filter "${target.name || 'Unnamed Rule'}"?`, async () => {
            const previousRules = rules;
            const nextRules = rules.filter((rule) => rule.id !== ruleId);
            removeRuleLocally(ruleId);
            setSaving(true);
            try {
                await apiFetch('/api/maintenance/rules', { method: 'POST', body: JSON.stringify(nextRules) });
                addToast(`Deleted filter: ${target.name || 'Unnamed Rule'}.`);
                await refreshRules();
                onRulesUpdated?.();
            } catch (error: any) {
                setRules(previousRules);
                addToast(error.message || 'Failed to delete filter', 'error');
            } finally {
                setSaving(false);
            }
        });
    }, [addToast, onRulesUpdated, refreshRules, removeRuleLocally, rules]);

    const saveRules = useCallback(async () => {
        setSaving(true);
        try {
            await apiFetch('/api/maintenance/rules', { method: 'POST', body: JSON.stringify(rules) });
            addToast('Maintenance rules saved.');
            await refreshRules();
            onRulesUpdated?.();
        } catch (error: any) {
            addToast(error.message || 'Failed to save maintenance rules', 'error');
        } finally {
            setSaving(false);
        }
    }, [addToast, onRulesUpdated, refreshRules, rules]);

    const rebuildIndex = useCallback(async () => {
        try {
            await apiFetch('/api/maintenance/index/rebuild', { method: 'POST' });
            addToast('Maintenance index rebuilt.');
            await loadAll();
        } catch (error: any) {
            addToast(error.message || 'Failed to rebuild maintenance index', 'error');
        }
    }, [addToast, loadAll]);

    const runPreview = useCallback(async (ruleId: string) => {
        setPreviewRuleId(ruleId);
        try {
            const ruleDraft = rules.find((rule) => rule.id === ruleId);
            const payload = await apiFetch('/api/maintenance/preview', {
                method: 'POST',
                body: JSON.stringify({ ruleId, rule: ruleDraft || undefined, includeAll: true, includeArrDiagnostics: true })
            }) as PreviewResponse;
            const previews = Array.isArray(payload?.previews) ? payload.previews : [];
            setPreviewData((currentPreviews) => {
                const previewsByRule = new Map(currentPreviews.map((preview) => [preview.ruleId, preview]));
                previews.forEach((preview) => previewsByRule.set(preview.ruleId, preview));
                return Array.from(previewsByRule.values());
            });
            const current = previews.find((preview) => preview.ruleId === ruleId) || previews[0];
            const eligible = current?.eligibleCount ?? current?.totalMatches ?? 0;
            const actionable = current?.actionableCount ?? '—';
            const inGrace = current?.inGraceCount ?? 0;
            const graceDays = current?.graceRemainingDays ?? 0;
            addToast(
                graceDays > 0
                    ? `Preview: ${current?.totalMatches ?? 0} match(es), all in grace (${graceDays} day(s) remaining).`
                    : `Preview: ${current?.totalMatches ?? 0} match(es), ${eligible} eligible, ${actionable} mapped in Sonarr/Radarr${inGrace ? `, ${inGrace} in grace` : ''}.`
            );
        } catch (error: any) {
            addToast(error.message || 'Failed to generate preview', 'error');
        } finally {
            setPreviewRuleId(null);
        }
    }, [addToast, rules]);

    const runRule = useCallback(async (ruleId: string, dryRun: boolean) => {
        if (isRuleDirty(ruleId)) {
            addToast('Save your filter changes before running.', 'error');
            return;
        }
        const useCollectionPin = !dryRun && pinCollectionOnDestructiveRun;
        const executeRun = async () => {
            setRunningRuleId(ruleId);
            try {
                const response = await apiFetch('/api/maintenance/run', {
                    method: 'POST',
                    body: JSON.stringify({
                        ruleId,
                        dryRun,
                        confirmToken: dryRun ? null : 'CONFIRM_MAINTENANCE_DELETE',
                        runOptions: dryRun ? {} : { createAndPinCollection: useCollectionPin }
                    })
                }) as RunResponse;
                const latestRun = Array.isArray(response?.runs) ? response.runs[0] : null;
                const summary = latestRun ? formatMaintenanceRunSummary(latestRun) : '';
                addToast(dryRun
                    ? (summary ? `Dry-run completed (${summary}).` : 'Dry-run completed.')
                    : (summary
                        ? (useCollectionPin ? `Destructive run completed with collection pinning (${summary}).` : `Destructive run completed (${summary}).`)
                        : (useCollectionPin ? 'Rule execution completed with collection pinning.' : 'Rule execution completed.')));
                await runPreview(ruleId);
                onRulesUpdated?.();
            } catch (error: any) {
                addToast(error.message || 'Rule execution failed', 'error');
            } finally {
                setRunningRuleId(null);
            }
        };

        if (dryRun) {
            await executeRun();
            return;
        }

        try {
            const preflight = await apiFetch('/api/maintenance/preflight', {
                method: 'POST',
                body: JSON.stringify({ ruleId })
            }) as PreflightResponse;
            if (!preflight.ok) {
                addToast((preflight.errors || ['Preflight check failed.']).join(' '), 'error');
                return;
            }
            let confirmMessage = useCollectionPin
                ? 'Run destructive maintenance action now? This will delete via Sonarr/Radarr and also create/pin a Plex collection to home for all users.'
                : 'Run destructive maintenance action now? This will delete matching items via Sonarr/Radarr using the saved filter.';
            if (preflight.warnings?.length) confirmMessage += `\n\nWarnings:\n- ${preflight.warnings.join('\n- ')}`;
            if (preflight.preview) {
                const preview = preflight.preview;
                confirmMessage += `\n\nWould process up to ${preview.wouldProcessCount} item(s): ${preview.actionableCount} mapped in Sonarr/Radarr, ${preview.unactionableCount} unmapped.`;
                if (preview.graceRemainingDays > 0) confirmMessage += ` ${preview.inGraceCount} still in grace (${preview.graceRemainingDays} day(s) remaining).`;
            }
            appConfirm(confirmMessage, executeRun);
        } catch (error: any) {
            addToast(error.message || 'Preflight check failed', 'error');
        }
    }, [addToast, isRuleDirty, onRulesUpdated, pinCollectionOnDestructiveRun, runPreview]);

    const resetRuleGraceTimer = useCallback(async (ruleId: string) => {
        const target = rules.find((rule) => rule.id === ruleId);
        if (!target) return;
        setResettingRuleId(ruleId);
        try {
            await apiFetch('/api/maintenance/rules/reset-grace', { method: 'POST', body: JSON.stringify({ ruleId }) });
            addToast(`Grace timer reset for "${target.name || 'Unnamed Rule'}".`);
            await Promise.all([refreshRules(), runPreview(ruleId)]);
            onRulesUpdated?.();
        } catch (error: any) {
            addToast(error.message || 'Failed to reset grace timer', 'error');
        } finally {
            setResettingRuleId(null);
        }
    }, [addToast, onRulesUpdated, refreshRules, rules, runPreview]);

    const toggleRuleEnabled = useCallback(async (ruleId: string) => {
        const target = rules.find((rule) => rule.id === ruleId);
        if (!target) return;
        const previousRules = rules;
        const nextEnabled = target.enabled === false;
        const nextRules = rules.map((rule) => rule.id === ruleId ? { ...rule, enabled: nextEnabled } : rule);
        setRules(nextRules);
        setTogglingRuleId(ruleId);
        try {
            await apiFetch('/api/maintenance/rules', { method: 'POST', body: JSON.stringify(nextRules) });
            addToast(`Filter ${nextEnabled ? 'enabled' : 'disabled'}: "${target.name || 'Unnamed Rule'}".`);
            await Promise.all([refreshRules(), runPreview(ruleId)]);
            onRulesUpdated?.();
        } catch (error: any) {
            setRules(previousRules);
            addToast(error.message || 'Failed to update filter status', 'error');
        } finally {
            setTogglingRuleId(null);
        }
    }, [addToast, onRulesUpdated, refreshRules, rules, runPreview]);

    return {
        fields,
        rules,
        previewByRuleId,
        selectedRule,
        selectedRuleId,
        selectedPreview,
        indexInfo,
        loading,
        saving,
        runningRuleId,
        previewRuleId,
        resettingRuleId,
        togglingRuleId,
        pinCollectionOnDestructiveRun,
        addRule,
        deleteRule,
        isRuleDirty,
        rebuildIndex,
        resetRuleGraceTimer,
        runPreview,
        runRule,
        saveRules,
        setPinCollectionOnDestructiveRun,
        setSelectedRuleId,
        toggleRuleEnabled,
        updateRule
    };
};
