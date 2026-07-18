import type { UserPreferencesState } from './useUserPreferences';

export type SectionProps = {
    account?: any;
    readOnly: boolean;
    prefs: UserPreferencesState;
};
