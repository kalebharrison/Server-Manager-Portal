export type NavigationRoute = 'admin' | 'user' | 'status' | 'dashboard' | 'issues' | 'settings' | 'preferences' | 'logs' | 'analytics' | 'mediastack' | 'request' | 'scanner';

export interface NavigationProps {
    currentRoute: string;
    onNavigate: (route: NavigationRoute) => void;
    onLogout: () => void;
    isAdmin: boolean;
    serverName: string;
    adminThumb?: string | null;
    customLogoUrl?: string | null;
    navOrder: string[];
    navHiddenKeys?: string[];
    navFeatures?: {
        request?: boolean;
        /** When false, hide Request Content (portal Discover already covers it). */
        requestNav?: boolean;
        scanner?: boolean;
    };
    appVersion?: string;
    activeTheme: string;
    setActiveTheme: (theme: string) => void;
}
