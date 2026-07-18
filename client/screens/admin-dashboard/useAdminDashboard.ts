import { useCallback, useEffect, useMemo, useState } from 'react';

import { apiFetch } from '../../shared/api';
import { pushToast } from '../../shared/toast';
import type { AppSettings, ToastMessage, User } from '../../shared/types';

import { filterAndSortUsers } from './adminDashboardUserFilters';
import type { AdminSortBy, AdminStatusFilter } from './adminDashboardTypes';
import { useAdminDashboardUserActions } from './useAdminDashboardUserActions';

export type { AdminSortBy, AdminStatusFilter } from './adminDashboardTypes';

export const useAdminDashboard = ({ onViewAsUser }: { onViewAsUser: (userId: string) => Promise<void> }) => {
    const [users, setUsers] = useState<User[]>([]);
    const [isConfigured, setConfigured] = useState(false);
    const [configSettings, setConfigSettings] = useState<AppSettings>({ checkIntervalMinutes: 60 });
    const [isUserModalOpen, setUserModalOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<User | null>(null);
    const [isLoading, setLoading] = useState(true);
    const [toasts, setToasts] = useState<ToastMessage[]>([]);
    const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
    const [bulkCustomDate, setBulkCustomDate] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<AdminStatusFilter>('all');
    const [sortBy, setSortBy] = useState<AdminSortBy>('username-asc');
    const mediaServerType = String(configSettings.mediaServerType || 'plex').toLowerCase();
    const mediaServerLabel = mediaServerType === 'jellyfin' ? 'Jellyfin' : 'Plex';

    const addToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
        setToasts(t => pushToast(t, message, type));
    }, []);

    const fetchUsers = useCallback(async () => {
        try {
            const usersData = await apiFetch('/api/users');
            setUsers(usersData);
        } catch (error) {
            addToast(error instanceof Error ? error.message : 'Failed to fetch users.', 'error');
        }
    }, [addToast]);

    useEffect(() => {
        const checkConfigAndFetchData = async () => {
            setLoading(true);
            try {
                const configStatus = await apiFetch('/api/config');
                setConfigured(configStatus.configured);
                setConfigSettings(configStatus.settings);

                if (configStatus.configured) {
                    await fetchUsers();
                } else {
                    addToast('Welcome! Please configure your media server settings to begin.', 'success');
                }
            } catch (error) {
                addToast(error instanceof Error ? error.message : 'Could not connect to backend.', 'error');
            } finally {
                setLoading(false);
            }
        };
        checkConfigAndFetchData();
    }, [fetchUsers, addToast]);

    const handleCloseModal = useCallback(() => {
        setUserModalOpen(false);
        setEditingUser(null);
    }, []);

    const {
        handleImportUsers,
        revokePlexAccess,
        handleViewAsUser,
        handleSaveUser,
        handleDeleteUser,
        handleToggleSelection,
        handleBulkUpdate,
    } = useAdminDashboardUserActions({
        setUsers,
        setLoading,
        addToast,
        mediaServerLabel,
        isConfigured,
        selectedUserIds,
        setSelectedUserIds,
        setBulkCustomDate,
        fetchUsers,
        onViewAsUser,
        onCloseModal: handleCloseModal,
    });

    const handleOpenUserModal = (user: User) => {
        setEditingUser(user);
        setUserModalOpen(true);
    };

    const filteredAndSortedUsers = useMemo(
        () => filterAndSortUsers(users, searchQuery, statusFilter, sortBy),
        [users, searchQuery, statusFilter, sortBy],
    );

    const filteredUserIds = useMemo(() => filteredAndSortedUsers.map(u => u.id), [filteredAndSortedUsers]);
    const allFilteredSelected = filteredUserIds.length > 0 && filteredUserIds.every(id => selectedUserIds.includes(id));

    return {
        users,
        isConfigured,
        isUserModalOpen,
        editingUser,
        isLoading,
        toasts,
        setToasts,
        selectedUserIds,
        setSelectedUserIds,
        bulkCustomDate,
        setBulkCustomDate,
        searchQuery,
        setSearchQuery,
        statusFilter,
        setStatusFilter,
        sortBy,
        setSortBy,
        mediaServerLabel,
        addToast,
        handleImportUsers,
        revokePlexAccess,
        handleOpenUserModal,
        handleViewAsUser,
        handleCloseModal,
        handleSaveUser,
        handleDeleteUser,
        handleToggleSelection,
        handleBulkUpdate,
        filteredAndSortedUsers,
        filteredUserIds,
        allFilteredSelected,
    };
};

export type AdminDashboardState = ReturnType<typeof useAdminDashboard>;
