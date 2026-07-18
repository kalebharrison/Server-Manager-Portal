import React, { Suspense, lazy } from 'react';

import { stripBasePath } from '../shared/basePath';
import { Loader } from '../shared/toast';
import { LoginView } from './login/LoginView';
import { useLogin } from './login/useLogin';

const SetupWizard = lazy(() => import('../setup/SetupWizard').then(module => ({ default: module.SetupWizard })));

export const Login: React.FC<{ onLoginSuccess: () => void, publicConfig?: any, initialError?: string }> = ({ onLoginSuccess, publicConfig, initialError }) => {
    const login = useLogin({ onLoginSuccess, initialError });

    if (login.publicInfo.isConfigured === false || (typeof window !== 'undefined' && stripBasePath(window.location.pathname).startsWith('/auth/setup/'))) {
        return (
            <Suspense fallback={<Loader isLoading={true} isCinematic={!!publicConfig?.useCinematicLoading} />}>
                <SetupWizard onComplete={login.fetchPublicInfo} />
            </Suspense>
        );
    }

    if (login.publicInfo.isConfigured === null) {
        return <Loader isLoading={true} isCinematic={!!publicConfig?.useCinematicLoading} />;
    }

    return <LoginView {...login} publicConfig={publicConfig} publicInfo={login.publicInfo} />;
};
