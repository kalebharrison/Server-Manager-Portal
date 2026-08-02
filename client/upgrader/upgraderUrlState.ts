import { portalUrl } from '../shared/basePath';

export type UpgraderTab =
    | 'overview'
    | 'hunt'
    | 'integrity'
    | 'downloads'
    | 'clients'
    | 'rules'
    | 'activity'
    | 'profiles'
    | 'history'
    | 'exclusions';

export type UpgraderProfilesUrlState = {
    instance: string;
    formatPage: number;
    profilePage: number;
};

export type UpgraderUrlState = {
    tab: UpgraderTab;
    profiles: UpgraderProfilesUrlState;
};

const VALID_TABS = new Set<UpgraderTab>([
    'overview',
    'hunt',
    'integrity',
    'downloads',
    'clients',
    'rules',
    'activity',
    'profiles',
    'history',
    'exclusions',
]);

const normalizeTab = (raw: string | null): UpgraderTab => {
    if (!raw || raw === 'browse') return 'overview';
    if (raw === 'history') return 'activity';
    if (raw === 'exclusions') return 'rules';
    if (VALID_TABS.has(raw as UpgraderTab)) return raw as UpgraderTab;
    return 'overview';
};

export const defaultProfilesUrlState = (): UpgraderProfilesUrlState => ({
    instance: '',
    formatPage: 1,
    profilePage: 1,
});

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
