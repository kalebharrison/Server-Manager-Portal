import React from 'react';

import { AdminDashboardView } from './admin-dashboard/AdminDashboardView';
import { useAdminDashboard } from './admin-dashboard/useAdminDashboard';

export const AdminDashboard: React.FC<{ onViewAsUser: (userId: string) => Promise<void> }> = ({ onViewAsUser }) => {
    const dashboard = useAdminDashboard({ onViewAsUser });
    return <AdminDashboardView {...dashboard} />;
};
