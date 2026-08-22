import { portalUrl } from '../shared/basePath';
import type {
    IntegrityFindingCategoryFilter,
    IntegrityMediaFilter,
} from './qcIntegrityFindings';

export type UpgraderTab =
    | 'overview'
    | 'hunt'
    | 'integrity'
    | 'clients'
    | 'rules'
    | 'activity'
    | 'profiles'
    | 'history'
    | 'exclusions';

export type IntegrityView =
    | 'coverage'
    | 'findings'
    | 'lookup'
    | 'trim'
    | 'snoozed';

export type UpgraderProfilesUrlState = {
    instance: string;
    formatPage: number;
    profilePage: number;
};

export type UpgraderIntegrityUrlState = {
    view: IntegrityView;
    category: IntegrityFindingCategoryFilter;
    media: IntegrityMediaFilter;
    q: string;
};

export type UpgraderUrlState = {
    tab: UpgraderTab;
    profiles: UpgraderProfilesUrlState;
    integrity: UpgraderIntegrityUrlState;
};

const VALID_TABS = new Set<UpgraderTab>([
    'overview',
    'hunt',
    'integrity',
    'clients',
    'rules',
    'activity',
    'profiles',
    'history',
    'exclusions',
]);

const VALID_INTEGRITY_VIEWS = new Set<IntegrityView>([
    'coverage',
    'findings',
    'lookup',
    'trim',
    'snoozed',
]);

const VALID_INTEGRITY_CATEGORIES = new Set<IntegrityFindingCategoryFilter>([
    'all',
    'broken',
    'runtime',
    'runtime_short',
    'runtime_long',
    'trim',
    'hash',
    'path',
    'other',
]);

const VALID_INTEGRITY_MEDIA = new Set<IntegrityMediaFilter>([
    'all',
    'movie',
    'show',
    'album',
]);

const normalizeTab = (raw: string | null): UpgraderTab => {
    if (!raw || raw === 'browse') return 'overview';
    if (raw === 'history') return 'activity';
    if (raw === 'exclusions') return 'rules';
    if (raw === 'downloads') return 'hunt';
    if (VALID_TABS.has(raw as UpgraderTab)) return raw as UpgraderTab;
    return 'overview';
};

export const defaultProfilesUrlState = (): UpgraderProfilesUrlState => ({
    instance: '',
    formatPage: 1,
    profilePage: 1,
});

export const defaultIntegrityUrlState = (): UpgraderIntegrityUrlState => ({
    view: 'coverage',
    category: 'all',
    media: 'all',
    q: '',
});

const normalizeIntegrityView = (raw: string | null): IntegrityView => {
    if (raw && VALID_INTEGRITY_VIEWS.has(raw as IntegrityView)) return raw as IntegrityView;
    return 'coverage';
};

const normalizeIntegrityCategory = (raw: string | null): IntegrityFindingCategoryFilter => {
    if (raw === 'runtime') return 'runtime';
    if (raw && VALID_INTEGRITY_CATEGORIES.has(raw as IntegrityFindingCategoryFilter)) {
        return raw as IntegrityFindingCategoryFilter;
    }
    return 'all';
};

const normalizeIntegrityMedia = (raw: string | null): IntegrityMediaFilter => {
    if (raw && VALID_INTEGRITY_MEDIA.has(raw as IntegrityMediaFilter)) {
        return raw as IntegrityMediaFilter;
    }
    return 'all';
};

export const parseUpgraderUrl = (search = ''): UpgraderUrlState => {
    const params = new URLSearchParams(search);
    const tab = normalizeTab(params.get('tab'));

    return {
        tab,
        profiles: {
            instance: params.get('instance') || '',
            formatPage: Math.max(1, Number(params.get('formatPage')) || 1),
            profilePage: Math.max(1, Number(params.get('profilePage')) || 1),
        },
        integrity: {
            view: normalizeIntegrityView(params.get('view')),
            category: normalizeIntegrityCategory(params.get('category')),
            media: normalizeIntegrityMedia(params.get('media')),
            q: params.get('q') || '',
        },
    };
};

export const buildUpgraderSearch = (state: UpgraderUrlState): string => {
    const params = new URLSearchParams();

    if (state.tab !== 'overview') params.set('tab', state.tab);

    if (state.tab === 'profiles') {
        const p = state.profiles;
        if (p.instance) params.set('instance', p.instance);
        if (p.formatPage > 1) params.set('formatPage', String(p.formatPage));
        if (p.profilePage > 1) params.set('profilePage', String(p.profilePage));
    }

    if (state.tab === 'integrity') {
        const i = state.integrity || defaultIntegrityUrlState();
        if (i.view !== 'coverage') params.set('view', i.view);
        if (i.category !== 'all') params.set('category', i.category);
        if (i.media !== 'all') params.set('media', i.media);
        if (i.q.trim()) params.set('q', i.q.trim());
    }

    return params.toString();
};

export const buildUpgraderPath = (state: UpgraderUrlState): string => {
    const qs = buildUpgraderSearch(state);
    return qs ? `${portalUrl('/upgrader')}?${qs}` : portalUrl('/upgrader');
};

export const replaceUpgraderUrl = (state: UpgraderUrlState) => {
    const next = buildUpgraderPath(state);
    const current = `${window.location.pathname}${window.location.search}`;
    if (current !== next) {
        window.history.replaceState({ upgrader: true }, '', next);
    }
};

export const pushUpgraderUrl = (state: UpgraderUrlState) => {
    const next = buildUpgraderPath(state);
    window.history.pushState({ upgrader: true }, '', next);
};

export const readUpgraderUrl = (): UpgraderUrlState =>
    parseUpgraderUrl(typeof window !== 'undefined' ? window.location.search : '');
