import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { MaintenanceCalendarSection } from '../maintenance/MaintenanceCalendarSection';
import { MaintenanceCandidatesSection } from '../maintenance/MaintenanceCandidatesSection';
import { MaintenanceCollectionsSection } from '../maintenance/MaintenanceCollectionsSection';
import { MaintenanceExclusionsSection } from '../maintenance/MaintenanceExclusionsSection';
import { MaintenanceOverviewSection } from '../maintenance/MaintenanceOverviewSection';
import { MaintenanceRunLogsSection } from '../maintenance/MaintenanceRunLogsSection';
import { MaintenanceRuleLibrarySection } from '../maintenance/MaintenanceRuleLibrarySection';
import { MaintenanceSettingsSection } from '../maintenance/MaintenanceSettingsSection';
import { MaintenanceStorageSection } from '../maintenance/MaintenanceStorageSection';
import { LibraryMaintenancePanel } from '../maintenance/LibraryMaintenancePanel';
import {
    buildCalendarEligibility,
    getSelectedCalendarGroup
} from '../maintenance/maintenanceDashboardUtils';
import { apiFetch } from '../shared/api';
import { Loader, ToastContainer, pushToast } from '../shared/toast';
import type { ToastMessage } from '../shared/types';
import {
    buildOverviewInsights,
    filterCandidateItems,
    getDefaultMaintenancePreferences,
    getEmptyExclusionsSummary,
    getEmptyOverviewInsights,
    getInitialMaintenanceSection,
    isMaintenanceDisabledError,
    MAINTENANCE_SECTIONS,
    normalizeExclusionsSummary,
    type ExclusionsSummary,
    type OverviewInsights
} from './maintenance/dashboardModel';
import { MaintenanceDisabledNotice } from './maintenance/MaintenanceDisabledNotice';
import {
    MaintenanceMobileSectionSelect,
    MaintenanceSectionSidebar
} from './maintenance/MaintenanceDashboardNavigation';

export const MaintenanceDashboard: React.FC = () => {
    const [toasts, setToasts] = useState<ToastMessage[]>([]);
    const [maintenanceFeatureEnabled, setMaintenanceFeatureEnabled] = useState(false);
    const [overview, setOverview] = useState<any>(null);
    const [runs, setRuns] = useState<any[]>([]);
    const [previewGroups, setPreviewGroups] = useState<any[]>([]);
    const [rules, setRules] = useState<any[]>([]);
    const [overviewInsights, setOverviewInsights] = useState<OverviewInsights>(() => getEmptyOverviewInsights());
    const [preferences, setPreferences] = useState<any>(() => getDefaultMaintenancePreferences());
    const [candidateRuleId, setCandidateRuleId] = useState<string>('');
    const [candidateItems, setCandidateItems] = useState<any[]>([]);
    const [candidateSearch, setCandidateSearch] = useState('');
    const [isLoadingCandidates, setIsLoadingCandidates] = useState(false);
    const [libraryJsonInput, setLibraryJsonInput] = useState('');
    const [libraryItems, setLibraryItems] = useState<any[]>([]);
    const [libraryOptions, setLibraryOptions] = useState<Array<{ id: string; title: string; count: number }>>([]);
    const [libraryBrowseId, setLibraryBrowseId] = useState('all');
    const [libraryBrowseSearch, setLibraryBrowseSearch] = useState('');
    const [libraryBrowsePage, setLibraryBrowsePage] = useState(1);
    const [libraryBrowseLimit] = useState(48);
    const [libraryBrowseTotal, setLibraryBrowseTotal] = useState(0);
    const [libraryBrowseLoading, setLibraryBrowseLoading] = useState(false);
    const [selectedExcludeKeys, setSelectedExcludeKeys] = useState<string[]>([]);
    const [exclusionsSummary, setExclusionsSummary] = useState<ExclusionsSummary>(() => getEmptyExclusionsSummary());
    const [selectedCalendarDate, setSelectedCalendarDate] = useState<string | null>(null);
    const [storageSummary, setStorageSummary] = useState<any>(null);
    const [storageSummaryLoading, setStorageSummaryLoading] = useState(false);
    const [loading, setLoading] = useState(true);
    const [activeSection, setActiveSection] = useState(() => getInitialMaintenanceSection(window.location.hash));

    const addToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
        setToasts(t => pushToast(t, message, type));
    }, []);
    useEffect(() => {
        window.location.hash = `maintenance-${activeSection}`;
    }, [activeSection]);

    useEffect(() => {
        if (activeSection !== 'calendar') {
            setSelectedCalendarDate(null);
        }
    }, [activeSection]);

    const loadOverview = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        try {
            const configData = await apiFetch('/api/config');
            const isEnabled = !!configData?.settings?.maintenanceExperimentalEnabled;
            setMaintenanceFeatureEnabled(isEnabled);
            if (!isEnabled) {
                return;
            }
            const [indexData, runsData, previewData, rulesData, prefData] = await Promise.all([
                apiFetch('/api/maintenance/index'),
                apiFetch('/api/maintenance/runs'),
                apiFetch('/api/maintenance/preview', {
                    method: 'POST',
                    body: JSON.stringify({ limit: 30, includeArrDiagnostics: false })
                }),
                apiFetch('/api/maintenance/rules'),
                apiFetch('/api/maintenance/preferences')
            ]);
            setOverview(indexData || null);
            setRuns(Array.isArray(runsData) ? runsData : []);
            setPreviewGroups(Array.isArray(previewData?.previews) ? previewData.previews : []);
            setRules(Array.isArray(rulesData) ? rulesData : []);
            setPreferences(prefData || getDefaultMaintenancePreferences());
            setOverviewInsights(buildOverviewInsights(previewData));
        } catch (e: any) {
            if (isMaintenanceDisabledError(e)) {
                setMaintenanceFeatureEnabled(false);
                return;
            }
            addToast(e.message || 'Failed to load cleaner overview', 'error');
        } finally {
            if (!silent) setLoading(false);
        }
    }, [addToast]);

    useEffect(() => {
        loadOverview();
    }, [loadOverview]);

    useEffect(() => {
        if (!rules.length) {
            setCandidateRuleId('');
            setCandidateItems([]);
            return;
        }
        if (!candidateRuleId || !rules.some((rule: any) => rule.id === candidateRuleId)) {
            setCandidateRuleId(rules[0].id);
        }
    }, [rules, candidateRuleId]);

    const fetchCandidatesForRule = useCallback(async (ruleId: string) => {
        if (!maintenanceFeatureEnabled) {
            setCandidateItems([]);
            return;
        }
        if (!ruleId) {
            setCandidateItems([]);
            return;
        }
        setIsLoadingCandidates(true);
        try {
            const payload = await apiFetch('/api/maintenance/preview', {
                method: 'POST',
                body: JSON.stringify({
                    ruleId,
                    includeAll: true,
                    includeArrDiagnostics: false
                })
            });
            const previews = Array.isArray(payload?.previews) ? payload.previews : [];
            const selected = previews.find((preview: any) => preview.ruleId === ruleId);
            setCandidateItems((selected?.sample || []).map((item: any) => ({ ...item, _ruleId: selected?.ruleId, _ruleName: selected?.ruleName })));
        } catch (e: any) {
            if (isMaintenanceDisabledError(e)) {
                setMaintenanceFeatureEnabled(false);
                return;
            }
            addToast(e.message || 'Failed to load candidates', 'error');
        } finally {
            setIsLoadingCandidates(false);
        }
    }, [addToast, maintenanceFeatureEnabled]);

    useEffect(() => {
        if (maintenanceFeatureEnabled && (activeSection === 'candidates' || activeSection === 'storage' || activeSection === 'calendar')) {
            fetchCandidatesForRule(candidateRuleId);
        }
    }, [activeSection, candidateRuleId, fetchCandidatesForRule, maintenanceFeatureEnabled]);

    const saveAllRules = async (nextRules: any[]) => {
        await apiFetch('/api/maintenance/rules', { method: 'POST', body: JSON.stringify(nextRules) });
        setRules(nextRules);
    };

    const savePreferences = async (nextPrefs: any) => {
        const response = await apiFetch('/api/maintenance/preferences', { method: 'POST', body: JSON.stringify(nextPrefs) });
        setPreferences(response?.preferences || nextPrefs);
    };

    const loadExclusionsSummary = useCallback(async () => {
        if (!maintenanceFeatureEnabled) return;
        try {
            const payload = await apiFetch('/api/maintenance/exclusions/summary');
            setExclusionsSummary(normalizeExclusionsSummary(payload));
        } catch (e: any) {
            if (isMaintenanceDisabledError(e)) {
                setMaintenanceFeatureEnabled(false);
                return;
            }
            addToast(e.message || 'Failed to load exclusions summary.', 'error');
        }
    }, [addToast, maintenanceFeatureEnabled]);

    const refreshExclusionsSummaryQuietly = useCallback(() => {
        loadExclusionsSummary().catch(() => { });
    }, [loadExclusionsSummary]);

    const updateRatingKeyExclusions = async (nextKeys: string[]) => {
        const next = {
            ...preferences,
            exclusions: { ...(preferences.exclusions || {}), ratingKeys: nextKeys }
        };
        await savePreferences(next);
        refreshExclusionsSummaryQuietly();
    };

    const loadLibraryBrowse = useCallback(async () => {
        if (!maintenanceFeatureEnabled) return;
        setLibraryBrowseLoading(true);
        try {
            const params = new URLSearchParams({
                libraryId: libraryBrowseId,
                search: libraryBrowseSearch,
                page: String(libraryBrowsePage),
                limit: String(libraryBrowseLimit),
                includeExcluded: 'true'
            });
            const payload = await apiFetch(`/api/maintenance/library-items?${params.toString()}`);
            setLibraryItems(Array.isArray(payload?.items) ? payload.items : []);
            setLibraryOptions(Array.isArray(payload?.libraries) ? payload.libraries : []);
            setLibraryBrowseTotal(Number(payload?.total || 0));
        } catch (e: any) {
            if (isMaintenanceDisabledError(e)) {
                setMaintenanceFeatureEnabled(false);
                return;
            }
            addToast(e.message || 'Failed to load library posters.', 'error');
        } finally {
            setLibraryBrowseLoading(false);
        }
    }, [addToast, libraryBrowseId, libraryBrowseLimit, libraryBrowsePage, libraryBrowseSearch, maintenanceFeatureEnabled]);

    const loadStorageSummary = useCallback(async (ruleId?: string) => {
        if (!maintenanceFeatureEnabled) return;
        setStorageSummaryLoading(true);
        try {
            const query = ruleId ? `?ruleId=${encodeURIComponent(ruleId)}` : '';
            const payload = await apiFetch(`/api/maintenance/storage-summary${query}`);
            setStorageSummary(payload || null);
        } catch (e: any) {
            if (isMaintenanceDisabledError(e)) {
                setMaintenanceFeatureEnabled(false);
                return;
            }
            addToast(e.message || 'Failed to load storage summary.', 'error');
        } finally {
            setStorageSummaryLoading(false);
        }
    }, [addToast, maintenanceFeatureEnabled]);

    useEffect(() => {
        if (maintenanceFeatureEnabled && activeSection === 'exclusions') {
            loadExclusionsSummary();
        }
    }, [activeSection, loadExclusionsSummary, maintenanceFeatureEnabled]);

    useEffect(() => {
        if (maintenanceFeatureEnabled && activeSection === 'exclusions') {
            loadLibraryBrowse();
        }
    }, [activeSection, libraryBrowseId, libraryBrowsePage, libraryBrowseSearch, loadLibraryBrowse, maintenanceFeatureEnabled]);

    useEffect(() => {
        if (maintenanceFeatureEnabled && activeSection === 'storage') {
            loadStorageSummary(candidateRuleId || undefined);
        }
    }, [activeSection, candidateRuleId, maintenanceFeatureEnabled, loadStorageSummary]);

    const filteredCandidates = filterCandidateItems(candidateItems, candidateSearch);
    const selectedCandidateRule = useMemo(
        () => rules.find((rule: any) => rule.id === candidateRuleId) || null,
        [rules, candidateRuleId]
    );

    const excludedRatingKeySet = useMemo(
        () => new Set<string>((preferences?.exclusions?.ratingKeys || []).map((v: string) => String(v))),
        [preferences?.exclusions?.ratingKeys]
    );

    const calendarEligibility = useMemo(() => {
        return buildCalendarEligibility(filteredCandidates, selectedCandidateRule);
    }, [filteredCandidates, selectedCandidateRule?.createdAt, selectedCandidateRule?.graceDays]);

    const selectedCalendarGroup = useMemo(() => {
        return getSelectedCalendarGroup(selectedCalendarDate, calendarEligibility);
    }, [calendarEligibility, selectedCalendarDate]);

    return (
        <div className="w-full flex flex-col">
            <Loader isLoading={loading} />
            <ToastContainer toasts={toasts} setToasts={setToasts} />
            <header className="page-header">
                <h1 className="page-title">Cleaner</h1>
            </header>
            <div className="w-full flex flex-col p-0 md:p-8 bg-transparent md:glass-card rounded-none md:rounded-2xl border-0 md:border shadow-none">
                <MaintenanceMobileSectionSelect
                    activeSection={activeSection}
                    sections={MAINTENANCE_SECTIONS}
                    setActiveSection={setActiveSection}
                />
                <div className="md:grid md:grid-cols-[280px_minmax(0,1fr)] md:gap-6">
                    <MaintenanceSectionSidebar
                        activeSection={activeSection}
                        sections={MAINTENANCE_SECTIONS}
                        setActiveSection={setActiveSection}
                    />
                    <div className="overflow-y-auto flex-grow mb-4 custom-scrollbar space-y-4 md:pr-2">
                        {!maintenanceFeatureEnabled && (
                            <MaintenanceDisabledNotice />
                        )}
                        {maintenanceFeatureEnabled && (
                            <>
                                {activeSection === 'overview' && (
                                    <MaintenanceOverviewSection
                                        overview={overview}
                                        overviewInsights={overviewInsights}
                                        previewGroups={previewGroups}
                                        runs={runs}
                                    />
                                )}
                                {activeSection === 'rules' && <LibraryMaintenancePanel addToast={addToast} onRulesUpdated={() => loadOverview(true)} />}
                                {activeSection === 'collections' && (
                                    <MaintenanceCollectionsSection
                                        addToast={addToast}
                                        rules={rules}
                                        saveAllRules={saveAllRules}
                                        setRules={setRules}
                                    />
                                )}
                                {activeSection === 'candidates' && (
                                    <MaintenanceCandidatesSection
                                        rules={rules}
                                        candidateRuleId={candidateRuleId}
                                        candidateSearch={candidateSearch}
                                        filteredCandidates={filteredCandidates}
                                        isLoadingCandidates={isLoadingCandidates}
                                        selectedCandidateRule={selectedCandidateRule}
                                        setCandidateRuleId={setCandidateRuleId}
                                        setCandidateSearch={setCandidateSearch}
                                    />
                                )}
                                {activeSection === 'runs' && <MaintenanceRunLogsSection runs={runs} />}
                                {activeSection === 'calendar' && (
                                    <MaintenanceCalendarSection
                                        calendarEligibility={calendarEligibility}
                                        candidateRuleId={candidateRuleId}
                                        rules={rules}
                                        selectedCalendarGroup={selectedCalendarGroup}
                                        selectedCandidateRule={selectedCandidateRule}
                                        setCandidateRuleId={setCandidateRuleId}
                                        setSelectedCalendarDate={setSelectedCalendarDate}
                                    />
                                )}
                                {activeSection === 'storage' && (
                                    <MaintenanceStorageSection
                                        candidateRuleId={candidateRuleId}
                                        loadStorageSummary={loadStorageSummary}
                                        selectedCandidateRule={selectedCandidateRule}
                                        storageSummary={storageSummary}
                                        storageSummaryLoading={storageSummaryLoading}
                                    />
                                )}
                                {activeSection === 'library' && (
                                    <MaintenanceRuleLibrarySection
                                        addToast={addToast}
                                        libraryJsonInput={libraryJsonInput}
                                        rules={rules}
                                        saveAllRules={saveAllRules}
                                        setLibraryJsonInput={setLibraryJsonInput}
                                    />
                                )}
                                {activeSection === 'exclusions' && (
                                    <MaintenanceExclusionsSection
                                        addToast={addToast}
                                        excludedRatingKeySet={excludedRatingKeySet}
                                        exclusionsSummary={exclusionsSummary}
                                        libraryBrowseId={libraryBrowseId}
                                        libraryBrowseLimit={libraryBrowseLimit}
                                        libraryBrowseLoading={libraryBrowseLoading}
                                        libraryBrowsePage={libraryBrowsePage}
                                        libraryBrowseSearch={libraryBrowseSearch}
                                        libraryBrowseTotal={libraryBrowseTotal}
                                        libraryItems={libraryItems}
                                        libraryOptions={libraryOptions}
                                        loadExclusionsSummary={loadExclusionsSummary}
                                        loadLibraryBrowse={loadLibraryBrowse}
                                        preferences={preferences}
                                        savePreferences={savePreferences}
                                        selectedExcludeKeys={selectedExcludeKeys}
                                        setLibraryBrowseId={setLibraryBrowseId}
                                        setLibraryBrowsePage={setLibraryBrowsePage}
                                        setLibraryBrowseSearch={setLibraryBrowseSearch}
                                        setPreferences={setPreferences}
                                        setSelectedExcludeKeys={setSelectedExcludeKeys}
                                        updateRatingKeyExclusions={updateRatingKeyExclusions}
                                    />
                                )}
                                {activeSection === 'settings' && (
                                    <MaintenanceSettingsSection
                                        addToast={addToast}
                                        preferences={preferences}
                                        savePreferences={savePreferences}
                                        setPreferences={setPreferences}
                                    />
                                )}
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
