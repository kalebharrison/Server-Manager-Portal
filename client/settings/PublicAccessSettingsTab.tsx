import React from 'react';
import { Check } from 'lucide-react';

import { CustomSelect } from '../shared/ui';
import { SettingHint } from './SettingHint';

const SwitchRow: React.FC<{
    title: string;
    checked: boolean;
    onChange: (value: boolean) => void;
    children: React.ReactNode;
}> = ({ title, checked, onChange, children }) => (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-4 border-b border-border/40">
        <div><h3 className="font-bold text-text">{title}</h3>{children}</div>
        <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors ${checked ? 'bg-plex' : 'bg-border'}`}>
            <span className={`h-4 w-4 mt-1 rounded-full bg-white transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
        </button>
    </div>
);

export const PublicAccessSettingsTab: React.FC<{
    showLoginServerStats: boolean;
    useTrendingSlideshowOnLogin: boolean;
    referralEnabled: boolean;
    referralTrialDays: number;
    referralRewardDays: number;
    mediaServerType: 'plex' | 'jellyfin';
    libraries: Array<{ id: string; title: string }>;
    defaultLibraryIds: string[];
    hideStreamUsers: string;
    onShowLoginServerStatsChange: (value: boolean) => void;
    onUseTrendingSlideshowOnLoginChange: (value: boolean) => void;
    onReferralEnabledChange: (value: boolean) => void;
    onReferralTrialDaysChange: (value: number) => void;
    onReferralRewardDaysChange: (value: number) => void;
    onDefaultLibraryIdsChange: (value: string[]) => void;
    onHideStreamUsersChange: (value: string) => void;
}> = ({
    showLoginServerStats,
    useTrendingSlideshowOnLogin,
    referralEnabled,
    referralTrialDays,
    referralRewardDays,
    mediaServerType,
    libraries,
    defaultLibraryIds,
    hideStreamUsers,
    onShowLoginServerStatsChange,
    onUseTrendingSlideshowOnLoginChange,
    onReferralEnabledChange,
    onReferralTrialDaysChange,
    onReferralRewardDaysChange,
    onDefaultLibraryIdsChange,
    onHideStreamUsersChange,
}) => (
    <div className="mb-8">
        <h2 className="text-xl font-bold text-plex mb-2">Access & Privacy</h2>
        <p className="text-sm text-muted mb-4">Control public visibility, registration, and what members can see about one another. Timed access still comes from admin invites (and optional member referrals).</p>

        <SwitchRow title="Show library totals before login" checked={showLoginServerStats} onChange={onShowLoginServerStatsChange}>
            <SettingHint>Publicly expose movie, show, music, and 4K totals on login and invite pages. Disabled by default.</SettingHint>
        </SwitchRow>
        <SwitchRow title="Trending background on login" checked={useTrendingSlideshowOnLogin} onChange={onUseTrendingSlideshowOnLoginChange}>
            <SettingHint>Use TMDB artwork on public login pages. Requires the TMDB integration.</SettingHint>
        </SwitchRow>
        <SwitchRow title="Member referrals" checked={referralEnabled} onChange={onReferralEnabledChange}>
            <SettingHint>Allow members to create temporary-access referral links.</SettingHint>
        </SwitchRow>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-4 border-b border-border/40">
            <div><h3 className="font-bold text-text">Stream viewer privacy</h3><SettingHint>Admins see account names. Members see either Anonymous or no viewer label.</SettingHint></div>
            <CustomSelect value={hideStreamUsers} onChange={onHideStreamUsersChange} options={[{ label: 'Show Anonymous', value: 'anonymous' }, { label: 'Hide Viewer Label', value: 'hidden' }]} compact className="w-full sm:w-52" />
        </div>

        {mediaServerType === 'plex' && libraries.length > 0 && (
            <div className="pt-5">
                <h3 className="font-bold text-text">Default shared libraries</h3>
                <SettingHint>Applied to invites without an override, referral access, and account relinking. Leave empty to share all libraries.</SettingHint>
                <div className="flex flex-wrap gap-2 mt-3">
                    {libraries.map((library) => {
                        const selected = defaultLibraryIds.includes(library.id);
                        return (
                            <button type="button" key={library.id} onClick={() => onDefaultLibraryIdsChange(selected ? defaultLibraryIds.filter((id) => id !== library.id) : [...defaultLibraryIds, library.id])} className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm ${selected ? 'bg-plex/10 border-plex text-plex font-bold' : 'bg-background border-border text-muted hover:text-text'}`}>
                                {selected && <Check className="w-3.5 h-3.5" />}{library.title}
                            </button>
                        );
                    })}
                </div>
            </div>
        )}

        {referralEnabled && (
            <div className="grid sm:grid-cols-2 gap-4 pt-5">
                <label className="text-sm font-bold text-text">Referred access days
                    <input type="number" min="1" className="mt-2 w-full p-3 rounded-lg border border-border bg-background text-text" value={referralTrialDays} onChange={(event) => onReferralTrialDaysChange(Math.max(1, Number(event.target.value) || 1))} />
                </label>
                <label className="text-sm font-bold text-text">Referrer reward days
                    <input type="number" min="0" className="mt-2 w-full p-3 rounded-lg border border-border bg-background text-text" value={referralRewardDays} onChange={(event) => onReferralRewardDaysChange(Math.max(0, Number(event.target.value) || 0))} />
                </label>
            </div>
        )}
    </div>
);
