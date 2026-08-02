import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowUpCircle, RefreshCw, Search, Settings as SettingsIcon, ArrowUpFromLine, Layers, Clock, History, Ban, Filter, Settings2 } from 'lucide-react';
import { apiFetch } from '../shared/api';
import { portalUrl, resolvePortalAssetUrl } from '../shared/basePath';
import { CustomSelect, OverlayCheckbox } from '../shared/ui';
import { Loader, ToastContainer, pushToast } from '../shared/toast';
import { normalizeUpgraderGridSize, UPGRADER_GRID_SIZE_OPTIONS, UPGRADER_GRID_SIZE_STORAGE_KEY, upgraderPosterGridClass, upgraderPosterGridStyle, type UpgraderGridSize } from '../shared/portalLayout';
import { DiscoverPosterCard } from '../screens/DiscoverContent';
import type { ToastMessage } from '../shared/types';
import { UpgraderUpgradeModal } from './UpgraderUpgradeModal';
import { UpgraderShowDrawer } from './UpgraderShowDrawer';
import { UpgraderHistoryPanel } from './UpgraderHistoryPanel';
import { UpgraderExclusionsPanel } from './UpgraderExclusionsPanel';
import { UpgraderProfilesTab } from './UpgraderProfilesTab';
import type {
    UpgraderItem,
    UpgraderCodec,
    UpgraderResolution,
    UpgraderFeature,
    UpgraderQuality,
    UpgraderQueueSummary,
    UpgraderStatus,
    UpgraderSummary,
} from './types';
import {
    readUpgraderUrl,
    replaceUpgraderUrl,
    type UpgraderProfilesUrlState,
    type UpgraderTab,
} from './upgraderUrlState';
import { UPGRADER_CODEC_OPTIONS, UPGRADER_RESOLUTION_OPTIONS, UPGRADER_FEATURE_OPTIONS, UPGRADER_QUALITY_OPTIONS } from './presets';

const SORT_OPTIONS = [
    { value: 'score', label: 'Lowest score first' },
    { value: 'sizeGB', label: 'Largest files first' },
    { value: 'title', label: 'Title A–Z' },
    { value: 'addedAt', label: 'Recently added' },
];

const isUpgradableItem = (item: UpgraderItem) => {
    if (item.mediaType === 'show') return (item.totalEpisodeCount ?? item.episodeCount ?? 0) > 0;
    return item.hasFile !== false;
};

type UpgraderTabId = UpgraderTab;

const readStoredSet = <T extends string>(key: string): Set<T> => {
    try {
        const raw = window.localStorage.getItem(key);
        return raw ? new Set(JSON.parse(raw) as T[]) : new Set();
    } catch {
        return new Set();
    }
};

const formatIndexAge = (generatedAt: string | null) => {
    if (!generatedAt) return 'never built';
    const ageMs = Date.now() - Date.parse(generatedAt);
    if (!Number.isFinite(ageMs) || ageMs < 0) return 'just now';
    const hours = Math.floor(ageMs / (60 * 60 * 1000));
    if (hours < 1) return 'under 1h ago';
    if (hours < 48) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
};

const isUpgraderDisabledError = (error: unknown) => {
    const msg = String((error as Error)?.message || error || '').toLowerCase();
    return msg.includes('library upgrader is disabled') || msg.includes('plex-only');
};

export const UpgraderDashboard: React.FC = () => {
    const initialUrl = useMemo(() => readUpgraderUrl(), []);
    const [toasts, setToasts] = useState<ToastMessage[]>([]);
    const [loading, setLoading] = useState(true);
    const [rebuilding, setRebuilding] = useState(false);
    const [featureEnabled, setFeatureEnabled] = useState(false);
    const [status, setStatus] = useState<UpgraderStatus | null>(null);
    const [summary, setSummary] = useState<UpgraderSummary | null>(null);
    const [queue, setQueue] = useState<UpgraderQueueSummary | null>(null);
    const [items, setItems] = useState<UpgraderItem[]>([]);
    const [total, setTotal] = useState(0);
    const [libraries, setLibraries] = useState<Array<{ id: string; title: string; count: number }>>([]);
    const [codecs, setCodecs] = useState<Set<UpgraderCodec>>(() => {
        const fromUrl = initialUrl.browse.codecs;
        if (fromUrl.length) return new Set(fromUrl as UpgraderCodec[]);
        return readStoredSet<UpgraderCodec>('upgrader_filters_codecs');
    });
    const [resolutions, setResolutions] = useState<Set<UpgraderResolution>>(() => {
        const fromUrl = initialUrl.browse.resolutions;
        if (fromUrl.length) return new Set(fromUrl as UpgraderResolution[]);
        return readStoredSet<UpgraderResolution>('upgrader_filters_resolutions');
    });
    const [features, setFeatures] = useState<Set<UpgraderFeature>>(() => {
        const fromUrl = initialUrl.browse.features;
        if (fromUrl.length) return new Set(fromUrl as UpgraderFeature[]);
        return readStoredSet<UpgraderFeature>('upgrader_filters_features');
    });
    const [qualities, setQualities] = useState<Set<UpgraderQuality>>(() => {
        const fromUrl = initialUrl.browse.qualities;
        if (fromUrl.length) return new Set(fromUrl as UpgraderQuality[]);
        return readStoredSet<UpgraderQuality>('upgrader_filters_qualities');
    });
    const [filtersExpanded, setFiltersExpanded] = useState(() => {
        try { return window.localStorage.getItem('upgrader_filters_expanded') === 'true'; } catch { return false; }
    });
    const [presetReady, setPresetReady] = useState(false);
    const [sort, setSort] = useState(() => initialUrl.browse.sort || window.localStorage.getItem('upgrader_filters_sort') || 'score');
    const [libraryId, setLibraryId] = useState(() => initialUrl.browse.library || window.localStorage.getItem('upgrader_filters_library') || 'all');
    const [mediaType, setMediaType] = useState(() => initialUrl.browse.type || window.localStorage.getItem('upgrader_filters_type') || 'all');
    const [search, setSearch] = useState(initialUrl.browse.search);
    const [searchInput, setSearchInput] = useState(initialUrl.browse.search);
    const [page, setPage] = useState(initialUrl.browse.page);
    const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
    const [upgradeItems, setUpgradeItems] = useState<UpgraderItem[]>([]);
    const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<UpgraderTabId>(initialUrl.tab);
    const [profilesUrl, setProfilesUrl] = useState<UpgraderProfilesUrlState>(initialUrl.profiles);
    const [showDrawerItem, setShowDrawerItem] = useState<UpgraderItem | null>(null);
    const [drawerPosition, setDrawerPosition] = useState<'sidebar' | 'modal'>('sidebar');

    const handleOpenDrawer = useCallback((item: UpgraderItem) => {
        window.history.pushState({ drawerOpen: true }, '', window.location.href);
        setShowDrawerItem(item);
    }, []);

    const handleCloseDrawer = useCallback(() => {
        if (window.history.state?.drawerOpen) {
            window.history.back();
        } else {
            setShowDrawerItem(null);
        }
    }, []);

    useEffect(() => {
        const onPopState = (e: PopStateEvent) => {
            if (!e.state?.drawerOpen) {
                setShowDrawerItem(null);
            }
        };
        window.addEventListener('popstate', onPopState);
        return () => window.removeEventListener('popstate', onPopState);
    }, []);

    const [gridSize, setGridSize] = useState<UpgraderGridSize>(() => {
        if (typeof window === 'undefined') return 'medium';
        return normalizeUpgraderGridSize(window.localStorage.getItem(UPGRADER_GRID_SIZE_STORAGE_KEY));
    });

    useEffect(() => {
        window.localStorage.setItem(UPGRADER_GRID_SIZE_STORAGE_KEY, gridSize);
        window.localStorage.setItem('upgrader_filters_codecs', JSON.stringify(Array.from(codecs)));
        window.localStorage.setItem('upgrader_filters_resolutions', JSON.stringify(Array.from(resolutions)));
        window.localStorage.setItem('upgrader_filters_features', JSON.stringify(Array.from(features)));
        window.localStorage.setItem('upgrader_filters_qualities', JSON.stringify(Array.from(qualities)));
        window.localStorage.setItem('upgrader_filters_expanded', String(filtersExpanded));
        window.localStorage.setItem('upgrader_filters_sort', sort);
        window.localStorage.setItem('upgrader_filters_library', libraryId);
        window.localStorage.setItem('upgrader_filters_type', mediaType);
    }, [gridSize, codecs, resolutions, features, qualities, filtersExpanded, sort, libraryId, mediaType]);

    const addToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'success') => {
        setToasts((prev) => pushToast(prev, message, type === 'info' ? 'success' : type));
    }, []);

    useEffect(() => {
        apiFetch('/api/config')
            .then((configData) => {
                const defaultSort = configData?.settings?.upgraderDefaultSort;
                const hasUrlSort = new URLSearchParams(window.location.search).has('sort');
                if (!hasUrlSort && !window.localStorage.getItem('upgrader_filters_sort') && defaultSort) {
                    setSort(defaultSort);
                }
            })
            .catch(() => {})
            .finally(() => setPresetReady(true));
    }, []);

    const syncUpgraderUrl = useCallback(() => {
        replaceUpgraderUrl({
            tab: activeTab,
            browse: {
                codecs: Array.from(codecs),
                resolutions: Array.from(resolutions),
                features: Array.from(features),
                qualities: Array.from(qualities),
                library: libraryId,
                type: mediaType,
                sort,
                search,
                page,
            },
            profiles: profilesUrl,
        });
    }, [activeTab, codecs, resolutions, features, qualities, libraryId, mediaType, sort, search, page, profilesUrl]);

    useEffect(() => {
        syncUpgraderUrl();
    }, [syncUpgraderUrl]);

    useEffect(() => {
        const onPopState = () => {
            const next = readUpgraderUrl();
            setActiveTab(next.tab);
            setCodecs(new Set(next.browse.codecs as UpgraderCodec[]));
            setResolutions(new Set(next.browse.resolutions as UpgraderResolution[]));
            setFeatures(new Set(next.browse.features as UpgraderFeature[]));
            setQualities(new Set(next.browse.qualities as UpgraderQuality[]));
            setLibraryId(next.browse.library);
            setMediaType(next.browse.type);
            setSort(next.browse.sort);
            setSearch(next.browse.search);
            setSearchInput(next.browse.search);
            setPage(next.browse.page);
            setProfilesUrl(next.profiles);
        };
        window.addEventListener('popstate', onPopState);
        return () => window.removeEventListener('popstate', onPopState);
    }, []);

    const handleTabChange = useCallback((tab: UpgraderTabId) => {
        setActiveTab(tab);
    }, []);

    const handleProfilesUrlChange = useCallback((patch: Partial<UpgraderProfilesUrlState>) => {
        setProfilesUrl((prev) => ({ ...prev, ...patch }));
    }, []);

    const loadData = useCallback(async (silent = false) => {
        if (!presetReady) return;
        if (!silent) setLoading(true);
        try {
            const configData = await apiFetch('/api/config');
            const enabled = !!configData?.settings?.upgraderEnabled;
            setFeatureEnabled(enabled);
            if (configData?.settings?.upgraderDrawerPosition) setDrawerPosition(configData.settings.upgraderDrawerPosition);
            if (!enabled) return;

            const [statusData, summaryData, itemsData, queueData] = await Promise.all([
                apiFetch('/api/upgrader/status'),
                apiFetch('/api/upgrader/summary'),
                apiFetch(`/api/upgrader/items?codecs=${encodeURIComponent(Array.from(codecs).join(','))}&resolutions=${encodeURIComponent(Array.from(resolutions).join(','))}&features=${encodeURIComponent(Array.from(features).join(','))}&qualities=${encodeURIComponent(Array.from(qualities).join(','))}&libraryId=${encodeURIComponent(libraryId)}&mediaType=${encodeURIComponent(mediaType)}&search=${encodeURIComponent(search)}&sort=${encodeURIComponent(sort)}&page=${page}&limit=48`),
                apiFetch('/api/upgrader/queue').catch(() => null),
            ]);

            setStatus(statusData || null);
            setSummary(summaryData || null);
            setQueue(queueData || null);
            setItems(Array.isArray(itemsData?.items) ? itemsData.items : []);
            setTotal(Number(itemsData?.total || 0));
            setLibraries(Array.isArray(itemsData?.libraries) ? itemsData.libraries : []);
        } catch (e: any) {
            if (isUpgraderDisabledError(e)) {
                setFeatureEnabled(false);
                return;
            }
            addToast(e.message || 'Failed to load upgrader data', 'error');
        } finally {
            if (!silent) setLoading(false);
        }
    }, [addToast, libraryId, mediaType, page, codecs, resolutions, features, qualities, presetReady, search, sort]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    useEffect(() => {
        const timer = window.setTimeout(() => {
            setSearch(searchInput.trim());
            setPage(1);
        }, 300);
        return () => window.clearTimeout(timer);
    }, [searchInput]);

    useEffect(() => {
        setSelectedKeys(new Set());
    }, [codecs, resolutions, features, qualities, libraryId, mediaType, search, page, sort]);

    useEffect(() => {
        if (status?.rebuildInProgress) {
            setRebuilding(true);
        } else if (rebuilding) {
            setRebuilding(false);
        }
    }, [status?.rebuildInProgress]);

    useEffect(() => {
        if (!rebuilding && !status?.rebuildInProgress) return undefined;
        const poll = window.setInterval(() => {
            loadData(true);
        }, 2500);
        return () => window.clearInterval(poll);
    }, [rebuilding, status?.rebuildInProgress, loadData]);

    const handleRebuild = async () => {
        try {
            await apiFetch('/api/upgrader/rebuild', { method: 'POST' });
            addToast('Library index rebuild started.', 'success');
            setRebuilding(true);
            await loadData(true);
        } catch (e: any) {
            addToast(e.message || 'Failed to rebuild index', 'error');
        }
    };

    const openUpgradeModal = (targets: UpgraderItem[]) => {
        if (!status?.automationEnabled) {
            addToast('Enable auto-hunt in Settings → Quality Hunt first.', 'error');
            return;
        }
        const upgradable = targets.filter((item) => isUpgradableItem(item));
        if (!upgradable.length) {
            addToast('No on-disk titles selected.', 'error');
            return;
        }
        setUpgradeItems(upgradable);
        setUpgradeModalOpen(true);
    };

    const toggleSelected = (ratingKey: string) => {
        setSelectedKeys((prev) => {
            const next = new Set(prev);
            if (next.has(ratingKey)) next.delete(ratingKey);
            else next.add(ratingKey);
            return next;
        });
    };

    const handleSnooze = async (item: UpgraderItem, days = 30) => {
        try {
            await apiFetch('/api/upgrader/snooze', {
                method: 'POST',
                body: JSON.stringify({ ratingKey: item.ratingKey, days }),
            });
            addToast(`Snoozed “${item.title}” for ${days} days.`, 'success');
            await loadData(true);
        } catch (e: any) {
            addToast(e.message || 'Failed to snooze title', 'error');
        }
    };

    const selectedItems = useMemo(
        () => items.filter((item) => selectedKeys.has(item.ratingKey)),
        [items, selectedKeys],
    );

    const summaryChips = useMemo(() => {
        if (!summary) return [];
        const chips = [
            `${summary.totalItems} titles indexed`,
            `index ${formatIndexAge(summary.generatedAt)}`,
        ];
        if (summary.upgradeCandidates != null) {
            chips.push(`${summary.upgradeCandidates} with files`);
        }
        if (summary.avgCustomFormatScore != null) {
            chips.push(`avg Arr score ${summary.avgCustomFormatScore}`);
        }
        if (status?.automationEnabled) {
            chips.push(`auto-grab on · ${status.recentUpgradeCount}/${status.maxActionsPerHour}/hr`);
        } else {
            chips.push('manual mode');
        }
        return chips;
    }, [summary, status]);

    const totalPages = Math.max(1, Math.ceil(total / 48));
    const automationReady = !!status?.automationEnabled;
    const advancedFilterCount = codecs.size + resolutions.size + features.size + qualities.size;

    const tabButtonClass = (tab: UpgraderTabId) =>
        `inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold border transition-colors ${
            activeTab === tab ? 'bg-plex text-background border-plex' : 'bg-white/5 text-muted border-white/10 hover:text-text'
        }`;

    return (
        <div className="w-full flex flex-col gap-6 pb-8">
            <ToastContainer toasts={toasts} setToasts={setToasts} />
            <UpgraderUpgradeModal
                isOpen={upgradeModalOpen}
                items={upgradeItems}
                onClose={() => setUpgradeModalOpen(false)}
                onCompleted={() => loadData(true)}
                addToast={addToast}
            />
            <UpgraderShowDrawer
                show={showDrawerItem}
                codecs={Array.from(codecs)}
                resolutions={Array.from(resolutions)}
                features={Array.from(features)}
                qualities={Array.from(qualities)}
                onClose={handleCloseDrawer}
                addToast={addToast}
                automationReady={automationReady}
                onProfileChanged={() => loadData(true)}
                position={drawerPosition}
            />
            <div className="flex flex-col gap-6">
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-3 mb-2">
                            <ArrowUpCircle className="w-8 h-8 text-plex" />
                            <h1 className="page-title">Quality Hunt</h1>
                        </div>
                        <p className="text-sm text-muted max-w-2xl">
                            Your Sonarr/Radarr library. Each poster shows the Arr custom-format score for the file you already have —
                            higher usually means better (Remux, DV/HDR, Atmos). Quality Hunt can search for a higher-scoring release and grab it.
                        </p>
                    </div>
                    {featureEnabled && (
                        <button
                            type="button"
                            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-plex text-background font-bold hover:bg-plex-hover transition-colors disabled:opacity-50"
                            onClick={handleRebuild}
                            disabled={rebuilding || !!status?.rebuildInProgress}
                        >
                            <RefreshCw className={`w-4 h-4 ${rebuilding || status?.rebuildInProgress ? 'animate-spin' : ''}`} />
                            {rebuilding || status?.rebuildInProgress ? 'Refreshing…' : 'Refresh library'}
                        </button>
                    )}
                </div>

                {!featureEnabled && (
                    <div className="rounded-2xl border border-yellow-500/30 bg-yellow-500/10 p-6 text-center">
                        <h3 className="text-xl font-bold text-plex mb-2">Quality Hunt is off</h3>
                        <p className="text-sm text-muted mb-3">Turn it on to index Arr libraries and hunt better releases.</p>
                        <p className="text-xs text-muted mb-4">Settings → Quality Hunt → enable, then save.</p>
                        <a
                            href={portalUrl('/settings#upgrader')}
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-plex text-background font-bold no-underline hover:bg-plex-hover transition-colors"
                        >
                            <SettingsIcon className="w-4 h-4" />
                            Open Settings
                        </a>
                    </div>
                )}

                {featureEnabled && (
                    <>
                        {summaryChips.length > 0 && activeTab === 'browse' && (
                            <div className="flex flex-wrap gap-2">
                                {summaryChips.map((chip) => (
                                    <span key={chip} className="text-xs font-semibold px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-text">
                                        {chip}
                                    </span>
                                ))}
                                {!status?.arrConfigured && (
                                    <span className="text-xs font-semibold px-3 py-1.5 rounded-full bg-yellow-500/10 border border-yellow-500/30 text-yellow-200">
                                        No Sonarr/Radarr instances configured
                                    </span>
                                )}
                                {status?.arrConfigured && status.automationEnabled && (
                                    <span className="text-xs font-semibold px-3 py-1.5 rounded-full bg-green-500/10 border border-green-500/30 text-green-400">
                                        Auto-hunt ON
                                    </span>
                                )}
                                {status?.arrConfigured && !status.automationEnabled && (
                                    <span className="text-xs font-semibold px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-200">
                                        Grabbing is off — Settings → Quality Hunt → Enable auto-hunt
                                    </span>
                                )}
                            </div>
                        )}

                        <div className="flex flex-wrap gap-2">
                            <button type="button" className={tabButtonClass('browse')} onClick={() => handleTabChange('browse')} title="Library titles from Sonarr/Radarr">
                                Library
                            </button>
                            <button type="button" className={tabButtonClass('history')} onClick={() => handleTabChange('history')} title="What Quality Hunt grabbed or skipped">
                                <History className="w-4 h-4" />
                                Activity
                            </button>
                            <button type="button" className={tabButtonClass('exclusions')} onClick={() => handleTabChange('exclusions')} title="Titles the hunt should ignore">
                                <Ban className="w-4 h-4" />
                                Skip list
                            </button>
                            <button type="button" className={tabButtonClass('profiles')} onClick={() => handleTabChange('profiles')} title="Tune Arr custom formats / quality profiles so scores mean best-of-best">
                                <Settings2 className="w-4 h-4" />
                                Arr scores
                            </button>
                        </div>

                        {activeTab === 'history' && <UpgraderHistoryPanel />}

                        {activeTab === 'exclusions' && (
                            <UpgraderExclusionsPanel addToast={addToast} onChanged={() => loadData(true)} />
                        )}

                        {activeTab === 'profiles' && (
                            <UpgraderProfilesTab
                                initialInstanceId={profilesUrl.instance}
                                initialFormatPage={profilesUrl.formatPage}
                                initialProfilePage={profilesUrl.profilePage}
                                onUrlStateChange={handleProfilesUrlChange}
                            />
                        )}

                        {activeTab === 'browse' && (
                            <>
                        {queue && queue.totalQueued > 0 && (
                            <div className="rounded-xl border border-border/60 bg-card/40 px-4 py-3 flex flex-wrap items-center gap-3">
                                <div className="flex items-center gap-2 text-sm font-semibold text-text">
                                    <Layers className="w-4 h-4 text-plex" />
                                    ARR queue: {queue.totalQueued} active
                                </div>
                                {queue.instances.filter((entry) => entry.total > 0).map((entry) => (
                                    <span key={entry.instanceId} className="text-xs px-2 py-1 rounded-full bg-white/5 border border-white/10 text-muted">
                                        {entry.instanceName}: {entry.total}
                                    </span>
                                ))}
                            </div>
                        )}

                        <div className="flex flex-col gap-3 p-4 rounded-2xl border border-border/60 bg-card/40">
                            <div className="flex flex-col sm:flex-row flex-wrap items-center gap-3 w-full">
                                <div className="relative flex-1 w-full sm:min-w-[200px]">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
                                    <input
                                        type="search"
                                        value={searchInput}
                                        onChange={(e) => setSearchInput(e.target.value)}
                                        placeholder="Search titles…"
                                        className="w-full pl-9 pr-3 py-2 h-[38px] rounded-lg border border-border bg-background text-text text-sm outline-none focus:border-plex"
                                    />
                                </div>
                                <CustomSelect
                                    value={mediaType}
                                    onChange={(value) => { setMediaType(value); setPage(1); }}
                                    options={[
                                        { value: 'all', label: 'Movies & shows' },
                                        { value: 'movie', label: 'Movies only' },
                                        { value: 'show', label: 'Shows only' },
                                    ]}
                                    className="flex-1 w-full sm:w-auto min-w-[140px]"
                                />
                                <CustomSelect
                                    value={libraryId}
                                    onChange={(value) => { setLibraryId(value); setPage(1); }}
                                    options={[{ value: 'all', label: 'All Arr instances' }, ...libraries.map((lib) => ({ value: lib.id, label: `${lib.title} (${lib.count})` }))]}
                                    className="flex-1 w-full sm:w-auto min-w-[140px]"
                                />
                                <CustomSelect
                                    value={sort}
                                    onChange={(value) => { setSort(value); setPage(1); }}
                                    options={SORT_OPTIONS}
                                    className="flex-1 w-full sm:w-auto min-w-[140px]"
                                />
                                <CustomSelect
                                    value={gridSize}
                                    onChange={(value) => setGridSize(normalizeUpgraderGridSize(value))}
                                    options={UPGRADER_GRID_SIZE_OPTIONS}
                                    className="flex-1 w-full sm:w-auto min-w-[140px]"
                                />
                                <button
                                    type="button"
                                    onClick={() => setFiltersExpanded(!filtersExpanded)}
                                    className="inline-flex items-center gap-2 px-3 py-2 h-[38px] rounded-lg border border-border bg-background text-sm font-semibold text-muted hover:text-text"
                                >
                                    <Filter className="w-4 h-4" />
                                    {filtersExpanded ? 'Hide filters' : 'More filters'}
                                    {advancedFilterCount > 0 && (
                                        <span className="rounded-full bg-plex/20 text-plex px-1.5 text-[10px] font-bold">{advancedFilterCount}</span>
                                    )}
                                </button>
                            </div>

                            {filtersExpanded && (
                                <div className="flex flex-row flex-wrap items-start gap-x-8 gap-y-3 pt-3 border-t border-white/5">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="text-xs font-bold text-muted uppercase tracking-wider mr-1">Codec</span>
                                        {UPGRADER_CODEC_OPTIONS.map((option) => (
                                            <button
                                                key={option.id}
                                                type="button"
                                                onClick={() => {
                                                    setCodecs((prev) => {
                                                        const next = new Set(prev);
                                                        if (next.has(option.id)) next.delete(option.id);
                                                        else next.add(option.id);
                                                        return next;
                                                    });
                                                    setPage(1);
                                                }}
                                                className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${codecs.has(option.id) ? 'bg-plex text-background border-plex' : 'bg-white/5 text-muted border-white/10 hover:text-text'}`}
                                            >
                                                {option.label}
                                            </button>
                                        ))}
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="text-xs font-bold text-muted uppercase tracking-wider mr-1">Resolution</span>
                                        {UPGRADER_RESOLUTION_OPTIONS.map((option) => (
                                            <button
                                                key={option.id}
                                                type="button"
                                                onClick={() => {
                                                    setResolutions((prev) => {
                                                        const next = new Set(prev);
                                                        if (next.has(option.id)) next.delete(option.id);
                                                        else next.add(option.id);
                                                        return next;
                                                    });
                                                    setPage(1);
                                                }}
                                                className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${resolutions.has(option.id) ? 'bg-plex text-background border-plex' : 'bg-white/5 text-muted border-white/10 hover:text-text'}`}
                                            >
                                                {option.label}
                                            </button>
                                        ))}
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="text-xs font-bold text-muted uppercase tracking-wider mr-1">Features</span>
                                        {UPGRADER_FEATURE_OPTIONS.map((option) => (
                                            <button
                                                key={option.id}
                                                type="button"
                                                onClick={() => {
                                                    setFeatures((prev) => {
                                                        const next = new Set(prev);
                                                        if (next.has(option.id)) next.delete(option.id);
                                                        else next.add(option.id);
                                                        return next;
                                                    });
                                                    setPage(1);
                                                }}
                                                className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${features.has(option.id) ? 'bg-plex text-background border-plex' : 'bg-white/5 text-muted border-white/10 hover:text-text'}`}
                                            >
                                                {option.label}
                                            </button>
                                        ))}
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="text-xs font-bold text-muted uppercase tracking-wider mr-1">Source</span>
                                        {UPGRADER_QUALITY_OPTIONS.map((option) => (
                                            <button
                                                key={option.id}
                                                type="button"
                                                onClick={() => {
                                                    setQualities((prev) => {
                                                        const next = new Set(prev);
                                                        if (next.has(option.id)) next.delete(option.id);
                                                        else next.add(option.id);
                                                        return next;
                                                    });
                                                    setPage(1);
                                                }}
                                                className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${qualities.has(option.id) ? 'bg-plex text-background border-plex' : 'bg-white/5 text-muted border-white/10 hover:text-text'}`}
                                            >
                                                {option.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        {automationReady && selectedItems.length > 0 && (
                            <div className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-plex/30 bg-plex/10 px-4 py-3 backdrop-blur-md">
                                <span className="text-sm font-semibold text-text">{selectedItems.length} selected</span>
                                <div className="flex gap-2">
                                    <button type="button" className="px-3 py-1.5 rounded-lg border border-border text-xs font-bold" onClick={() => setSelectedKeys(new Set())}>
                                        Clear
                                    </button>
                                    <button
                                        type="button"
                                        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-plex text-background text-xs font-bold"
                                        onClick={() => openUpgradeModal(selectedItems)}
                                    >
                                        <ArrowUpFromLine className="w-3.5 h-3.5" />
                                        Grab better releases
                                    </button>
                                </div>
                            </div>
                        )}

                        {loading ? (
                            <Loader isLoading />
                        ) : (status?.itemCount ?? 0) === 0 ? (
                            <div className="rounded-2xl border border-yellow-500/30 bg-yellow-500/10 p-8 text-center">
                                <h3 className="text-xl font-bold text-yellow-200 mb-2">Library index is empty</h3>
                                <p className="text-sm text-muted mb-4">
                                    Quality Hunt reads Sonarr/Radarr. Refresh the library index to populate titles and scores.
                                </p>
                                <button
                                    type="button"
                                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-plex text-background font-bold"
                                    onClick={handleRebuild}
                                    disabled={rebuilding || !!status?.rebuildInProgress}
                                >
                                    <RefreshCw className={`w-4 h-4 ${rebuilding ? 'animate-spin' : ''}`} />
                                    Refresh library
                                </button>
                            </div>
                        ) : total === 0 ? (
                            <div className="rounded-2xl border border-border/60 bg-card/40 p-8 text-center">
                                <h3 className="text-xl font-bold text-text mb-2">No matches</h3>
                                <p className="text-sm text-muted">Clear filters or try another Arr instance / search.</p>
                            </div>
                        ) : (
                            <>
                                <p className="text-xs text-muted">{total} title{total === 1 ? '' : 's'} · page {page} of {totalPages}</p>
                                <div className={upgraderPosterGridClass(gridSize)} style={upgraderPosterGridStyle(gridSize)}>
                                    {items.map((item) => {
                                        const canUpgrade = automationReady && isUpgradableItem(item);
                                        const isSelected = selectedKeys.has(item.ratingKey);
                                        const isShow = item.mediaType === 'show';
                                        const score = item.avgCustomFormatScore ?? item.customFormatScore ?? 0;
                                        const resLabel = item.videoResolution === '4k' ? '4K' : (item.videoResolution || '').toUpperCase() || '';
                                        const sourceLabel = item.sourceTier && item.sourceTier !== 'unknown' ? item.sourceTier : '';
                                        const extras = [
                                            item.hasDolbyVision ? 'DV' : (item.hasHdr ? 'HDR' : null),
                                            item.hasAtmos ? 'Atmos' : null,
                                        ].filter(Boolean);
                                        const qualityBits = [resLabel, sourceLabel, ...extras].filter(Boolean).join(' · ');
                                        const scoreBadgeText = qualityBits ? `Arr ${score} · ${qualityBits}` : `Arr score ${score}`;
                                        const scoreColorClass = score >= 100
                                            ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                                            : score > 0
                                                ? 'bg-amber-500/15 border-amber-500/30 text-amber-200'
                                                : 'bg-black/75 border-white/20 text-white/80';

                                        const sizesToShow: { label: string; sizeGB: number }[] = [];
                                        if (Number(item.sizeGB || 0) > 0) {
                                            sizesToShow.push({
                                                label: isShow ? 'on disk' : '',
                                                sizeGB: Number(item.sizeGB || 0),
                                            });
                                        }
                                        
                                        if (gridSize === 'list') {
                                            return (
                                                <div key={item.ratingKey} className="flex flex-col sm:flex-row gap-4 p-4 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-colors relative">
                                                    {automationReady && (
                                                        <div className="absolute top-2 left-2 z-20">
                                                            <OverlayCheckbox
                                                                checked={isSelected}
                                                                onChange={() => toggleSelected(item.ratingKey)}
                                                                size="md"
                                                                title={isSelected ? 'Deselect' : 'Select for upgrade'}
                                                            />
                                                        </div>
                                                    )}
                                                    <div className="w-full sm:w-24 shrink-0 aspect-[2/3] sm:aspect-auto sm:h-36 rounded-md overflow-hidden bg-black/50 relative border border-white/5 cursor-pointer" onClick={isShow ? () => handleOpenDrawer(item) : undefined}>
                                                        <img src={item.thumbUrl ? resolvePortalAssetUrl(item.thumbUrl) : (item.thumb ? portalUrl(`/api/plex/image?path=${encodeURIComponent(item.thumb)}&width=200&height=300`) : item.posterFallbackUrl ? resolvePortalAssetUrl(item.posterFallbackUrl) : '')} alt={item.title} className="w-full h-full object-cover" />
                                                    </div>
                                                    <div className="flex-1 min-w-0 flex flex-col justify-center gap-1">
                                                        <div className="flex items-start justify-between gap-4">
                                                            <div>
                                                                <button
                                                                    type="button"
                                                                    className={`text-lg font-bold text-text line-clamp-1 text-left ${isShow ? 'hover:text-plex transition-colors' : 'cursor-default'}`}
                                                                    onClick={isShow ? () => handleOpenDrawer(item) : undefined}
                                                                >
                                                                    {item.title}{item.year ? ` (${item.year})` : ''}
                                                                </button>
                                                                <div className="flex flex-wrap gap-2 mt-2">
                                                                    <span className="px-2 py-0.5 rounded-md bg-white/10 border border-white/5 text-xs font-semibold text-gray-300">
                                                                        {item.arrInstanceName || (item.arrType === 'radarr' ? 'Radarr' : 'Sonarr')}
                                                                    </span>
                                                                    {sizesToShow.map((s, idx) => (
                                                                        <span key={idx} className="px-2 py-0.5 rounded-md bg-white/10 border border-white/5 text-xs font-semibold text-gray-300">
                                                                            {`${s.sizeGB < 1 ? Math.round(s.sizeGB * 1024) + ' MB' : Math.round(s.sizeGB * 100) / 100 + ' GB'}${s.label ? ` (${s.label})` : ''}`}
                                                                        </span>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                            <span className={`shrink-0 text-xs font-bold px-2.5 py-1 rounded-full border ${scoreColorClass}`}>
                                                                {scoreBadgeText}
                                                            </span>
                                                        </div>
                                                        {item.overview && (
                                                            <div className="mt-2 text-xs text-muted line-clamp-2 md:line-clamp-3">
                                                                {item.overview}
                                                            </div>
                                                        )}
                                                        <div className="mt-auto pt-3 flex flex-wrap items-center gap-4">
                                                            {isShow && (
                                                                <button
                                                                    type="button"
                                                                    className="text-xs font-bold text-gray-300 hover:text-white transition-colors"
                                                                    onClick={() => handleOpenDrawer(item)}
                                                                >
                                                                    View Episodes
                                                                </button>
                                                            )}
                                                            {item.arrDeepUrl && (
                                                                <a
                                                                    href={item.arrDeepUrl}
                                                                    target="_blank"
                                                                    rel="noreferrer"
                                                                    className="text-xs font-bold text-plex hover:text-orange-400 transition-colors"
                                                                >
                                                                    Open in {item.arrType === 'radarr' ? 'Radarr' : 'Sonarr'}
                                                                </a>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        }

                                        const checkboxSize = gridSize === 'small' || gridSize === 'medium' ? 'sm' : 'md';
                                        return (
                                            <div key={item.ratingKey} className="relative min-w-0">
                                                {automationReady && (
                                                    <div className="absolute top-1.5 left-1.5 z-20 upgrader-card-select">
                                                        <OverlayCheckbox
                                                            checked={isSelected}
                                                            onChange={() => toggleSelected(item.ratingKey)}
                                                            size={checkboxSize}
                                                            title={isSelected ? 'Deselect' : 'Select for upgrade'}
                                                        />
                                                    </div>
                                                )}
                                                <span className={`absolute top-2 right-2 z-20 upgrader-card-badge text-[10px] font-bold px-2 py-1 rounded-full border ${scoreColorClass}`}>
                                                    {scoreBadgeText}
                                                </span>
                                                <DiscoverPosterCard
                                                    variant="home"
                                                    showQualityBadges={false}
                                                    item={{
                                                        title: item.title,
                                                        thumb: item.thumb,
                                                        thumbUrl: item.thumbUrl || undefined,
                                                        plexUrl: item.arrDeepUrl || '#',
                                                        tags: [],
                                                        year: item.year ?? undefined,
                                                    }}
                                                    footer={(
                                                        <div className="px-1 space-y-1">
                                                            {isShow ? (
                                                                <button
                                                                    type="button"
                                                                    className="upgrader-card-title text-xs font-medium text-text line-clamp-2 leading-tight text-left hover:text-plex transition-colors"
                                                                    onClick={() => handleOpenDrawer(item)}
                                                                >
                                                                    {item.title}{item.year ? ` (${item.year})` : ''}
                                                                </button>
                                                            ) : (
                                                                <div className="upgrader-card-title text-xs font-medium text-text line-clamp-2 leading-tight">
                                                                    {item.title}{item.year ? ` (${item.year})` : ''}
                                                                </div>
                                                            )}
                                                            <div className="upgrader-card-meta flex flex-wrap gap-1.5 mt-2">
                                                                <span className="px-1.5 py-0.5 rounded-md bg-white/10 border border-white/5 text-[10px] font-semibold text-gray-300">
                                                                    {item.arrInstanceName || (item.arrType === 'radarr' ? 'Radarr' : 'Sonarr')}
                                                                </span>
                                                                {sizesToShow.map((s, idx) => (
                                                                    <span key={idx} className="px-1.5 py-0.5 rounded-md bg-white/10 border border-white/5 text-[10px] font-semibold text-gray-300">
                                                                        {`${s.sizeGB < 1 ? Math.round(s.sizeGB * 1024) + ' MB' : Math.round(s.sizeGB * 100) / 100 + ' GB'}${s.label ? ` (${s.label})` : ''}`}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                            <div className="upgrader-card-actions flex flex-wrap gap-x-2 gap-y-1">
                                                                {isShow && (
                                                                    <button
                                                                        type="button"
                                                                        className="text-[10px] font-bold text-muted hover:underline"
                                                                        onClick={() => handleOpenDrawer(item)}
                                                                    >
                                                                        Episodes
                                                                    </button>
                                                                )}
                                                                {item.arrDeepUrl && (
                                                                    <a
                                                                        href={item.arrDeepUrl}
                                                                        target="_blank"
                                                                        rel="noreferrer"
                                                                        className="inline-block text-[10px] font-bold text-plex hover:underline"
                                                                    >
                                                                        Open in {item.arrType === 'radarr' ? 'Radarr' : 'Sonarr'}
                                                                    </a>
                                                                )}
                                                                {canUpgrade && (
                                                                    <button
                                                                        type="button"
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            openUpgradeModal([item]);
                                                                        }}
                                                                        className="text-[10px] font-bold text-plex hover:underline"
                                                                    >
                                                                        Grab better
                                                                    </button>
                                                                )}
                                                                {automationReady && (
                                                                    <button
                                                                        type="button"
                                                                        className="inline-flex items-center gap-1 text-[10px] font-bold text-muted hover:text-text"
                                                                        onClick={() => handleSnooze(item)}
                                                                        title="Hide from Quality Hunt for 30 days"
                                                                    >
                                                                        <Clock className="w-3 h-3" />
                                                                        Snooze
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </div>
                                                    )}
                                                />
                                            </div>
                                        );
                                    })}
                                </div>
                                {totalPages > 1 && (
                                    <div className="flex items-center justify-center gap-3">
                                        <button
                                            type="button"
                                            className="px-3 py-1.5 rounded-lg border border-border text-sm disabled:opacity-40"
                                            disabled={page <= 1}
                                            onClick={() => setPage((p) => Math.max(1, p - 1))}
                                        >
                                            Previous
                                        </button>
                                        <span className="text-sm text-muted">{page} / {totalPages}</span>
                                        <button
                                            type="button"
                                            className="px-3 py-1.5 rounded-lg border border-border text-sm disabled:opacity-40"
                                            disabled={page >= totalPages}
                                            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                                        >
                                            Next
                                        </button>
                                    </div>
                                )}
                            </>
                        )}
                            </>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};
