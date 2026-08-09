import { useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';

import { apiFetch } from '../../shared/api';
import { appConfirm } from '../../shared/confirm';
import type { User } from '../../shared/types';

type UseAdminDashboardUserActionsOptions = {
    setUsers: Dispatch<SetStateAction<User[]>>;
    setLoading: (value: boolean) => void;
    addToast: (message: string, type?: 'success' | 'error') => void;
    mediaServerLabel: string;
    isConfigured: boolean;
    selectedUserIds: string[];
    setSelectedUserIds: Dispatch<SetStateAction<string[]>>;
    setBulkCustomDate: Dispatch<SetStateAction<string>>;
    fetchUsers: () => Promise<void>;
    onViewAsUser: (userId: string) => Promise<void>;
    onCloseModal: () => void;
};

export const useAdminDashboardUserActions = ({
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
    onCloseModal,
}: UseAdminDashboardUserActionsOptions) => {
    const handleImportUsers = useCallback(async () => {
        if (!isConfigured) {
            addToast(`Please configure ${mediaServerLabel} settings first.`, 'error');
            return;
        }
        setLoading(true);
        try {
            const result = await apiFetch('/api/sync', { method: 'POST' });
            addToast(result.message || `Synced ${result.count} users from ${mediaServerLabel}.`);
            await fetchUsers();
        } catch (error) {
            addToast(error instanceof Error ? error.message : 'An unknown error occurred during sync.', 'error');
        } finally {
            setLoading(false);
        }
    }, [addToast, fetchUsers, isConfigured, mediaServerLabel, setLoading]);

    const revokePlexAccess = useCallback(async (userId: string) => {
        setLoading(true);
        try {
            const updatedUser = await apiFetch(`/api/users/${userId}/revoke`, { method: 'POST' });
            setUsers(currentUsers => currentUsers.map(u => u.id === userId ? updatedUser : u));
            addToast('Plex access revoked successfully.');
        } catch (error) {
            addToast(error instanceof Error ? error.message : 'Failed to revoke access.', 'error');
        } finally {
            setLoading(false);
        }
    }, [addToast, setLoading, setUsers]);

    const handleViewAsUser = useCallback(async (user: User) => {
        setLoading(true);
        try {
            await onViewAsUser(user.id);
        } catch (error) {
            addToast(error instanceof Error ? error.message : 'Failed to view as user.', 'error');
            setLoading(false);
        }
    }, [addToast, onViewAsUser, setLoading]);

    const handleSaveUser = useCallback(async (userToSave: User) => {
        setLoading(true);
        try {
            const updatedUser = await apiFetch(`/api/users/${userToSave.id}`, {
                method: 'PUT',
                body: JSON.stringify({
                    expiryDate: userToSave.expiryDate,
                    exemptFromCleanup: userToSave.exemptFromCleanup,
                    newsletterOptIn: userToSave.newsletterOptIn === true,
                    discordId: userToSave.discordId || '',
                    requestOverrides: userToSave.requestOverrides || {},
                }),
            });
            setUsers(currentUsers => currentUsers.map(u => u.id === updatedUser.id ? updatedUser : u));
            onCloseModal();
            addToast('User updated successfully!');
        } catch (error) {
            addToast(error instanceof Error ? error.message : 'Failed to save user.', 'error');
        } finally {
            setLoading(false);
        }
    }, [addToast, onCloseModal, setLoading, setUsers]);

    const handleDeleteUser = useCallback(async (userId: string) => {
        appConfirm(`Are you sure you want to delete this user? This will revoke ${mediaServerLabel} access first where supported.`, async () => {
            setLoading(true);
            try {
                await apiFetch(`/api/users/${userId}`, { method: 'DELETE' });
                setUsers(currentUsers => currentUsers.filter(u => u.id !== userId));
                addToast('User removed from manager.');
            } catch (error) {
                addToast(error instanceof Error ? error.message : 'Failed to delete user.', 'error');
            } finally {
                setLoading(false);
            }
        });
    }, [addToast, mediaServerLabel, setLoading, setUsers]);

    const handleToggleSelection = useCallback((userId: string) => {
        setSelectedUserIds(prev =>
            prev.includes(userId)
                ? prev.filter(id => id !== userId)
                : [...prev, userId]
        );
    }, [setSelectedUserIds]);

    const handleBulkUpdate = useCallback(async (action: 'addMonth' | 'addYear' | 'unlimited' | 'custom', customDate?: string) => {
        setLoading(true);
        try {
            await apiFetch('/api/users/bulk-update', {
                method: 'POST',
                body: JSON.stringify({ userIds: selectedUserIds, action, customDate }),
            });
            addToast(`Successfully updated ${selectedUserIds.length} users.`);
            setSelectedUserIds([]);
            setBulkCustomDate('');
            await fetchUsers();
        } catch (error) {
            addToast(error instanceof Error ? error.message : 'Bulk update failed.', 'error');
        } finally {
            setLoading(false);
        }
    }, [addToast, fetchUsers, selectedUserIds, setBulkCustomDate, setLoading, setSelectedUserIds]);

    return {
        handleImportUsers,
        revokePlexAccess,
        handleViewAsUser,
        handleSaveUser,
        handleDeleteUser,
        handleToggleSelection,
        handleBulkUpdate,
    };
};
