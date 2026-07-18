export type NavigationRoute = 'admin' | 'user' | 'status' | 'dashboard' | 'issues' | 'settings' | 'preferences' | 'logs' | 'analytics' | 'mediastack' | 'request';

export interface NavigationProps {
    currentRoute: string;
    onNavigate: (route: NavigationRoute) => void;
    onLogout: () => void;
    isAdmin: boolean;
    serverName: string;
    adminThumb?: string | null;
    customLogoUrl?: string | null;
    navOrder: string[];
    navFeatures?: {
        request?: boolean;
    };
    appVersion?: string;
    activeTheme: string;
    setActiveTheme: (theme: string) => void;
}
