import { portalUrl } from '../shared/basePath';

export type UpgraderTab = 'overview' | 'history' | 'exclusions' | 'profiles';

export type UpgraderProfilesUrlState = {
    instance: string;
    formatPage: number;
    profilePage: number;
};

export type UpgraderUrlState = {
    tab: UpgraderTab;
    profiles: UpgraderProfilesUrlState;
};

const VALID_TABS = new Set<UpgraderTab>(['overview', 'history', 'exclusions', 'profiles']);

export const defaultProfilesUrlState = (): UpgraderProfilesUrlState => ({
    instance: '',
    formatPage: 1,
    profilePage: 1,
});

export const parseUpgraderUrl = (search = ''): UpgraderUrlState => {
    const params = new URLSearchParams(search);
    const tabRaw = params.get('tab');
    // Legacy Library browse URLs land on Overview.
    const normalized = tabRaw === 'browse' || !tabRaw ? 'overview' : tabRaw;
    const tab = VALID_TABS.has(normalized as UpgraderTab) ? (normalized as UpgraderTab) : 'overview';

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
