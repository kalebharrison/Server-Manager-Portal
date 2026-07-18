import { useCallback, useMemo, useState } from 'react';

import { apiFetch } from '../shared/api';
import { appConfirm } from '../shared/confirm';

type UseSettingsAdminPanelLogsOptions = {
    addToast: (message: string, type?: 'success' | 'error') => void;
    setLoading: (value: boolean) => void;
};

export const useSettingsAdminPanelLogs = ({
    addToast,
    setLoading,
}: UseSettingsAdminPanelLogsOptions) => {
    const [auditLogEntries, setAuditLogEntries] = useState<any[]>([]);
    const [isLoadingAuditLog, setIsLoadingAuditLog] = useState(false);
    const [auditLogPage, setAuditLogPage] = useState(1);
    const [deletedUsersLog, setDeletedUsersLog] = useState<any[]>([]);
    const [emailLogPage, setEmailLogPage] = useState(1);

    const fetchAuditLog = useCallback(async () => {
        setIsLoadingAuditLog(true);
        try {
            const data = await apiFetch('/api/audit-log');
            setAuditLogEntries(Array.isArray(data) ? data : []);
            setAuditLogPage(1);
            setEmailLogPage(1);
        } catch (e) {
            addToast('Failed to load audit log', 'error');
        } finally {
            setIsLoadingAuditLog(false);
        }
    }, [addToast]);

    const fetchDeletedUsersLog = useCallback(async () => {
        try {
            const data = await apiFetch('/api/deleted-users');
            setDeletedUsersLog(Array.isArray(data) ? data : []);
        } catch (e) {
            addToast('Failed to load deleted users log', 'error');
        }
    }, [addToast]);

    const handleUnblockDeletedUser = useCallback(async (deletedUser: any) => {
        const label = deletedUser.username || deletedUser.email || 'this user';
        appConfirm(`Allow ${label} to use the portal again? This does not invite them automatically.`, async () => {
            setLoading(true);
            try {
                await apiFetch(`/api/deleted-users/${encodeURIComponent(deletedUser.blockId)}`, { method: 'DELETE' });
                addToast('Deleted user unblocked.');
                await Promise.all([fetchDeletedUsersLog(), fetchAuditLog()]);
            } catch (error: any) {
                addToast(error instanceof Error ? error.message : 'Failed to unblock user.', 'error');
            } finally {
                setLoading(false);
            }
        });
    }, [addToast, fetchAuditLog, fetchDeletedUsersLog, setLoading]);

    const auditEventsPerPage = 12;
    const totalAuditLogPages = Math.max(1, Math.ceil(auditLogEntries.length / auditEventsPerPage));
    const pagedAuditEntries = auditLogEntries.slice((auditLogPage - 1) * auditEventsPerPage, auditLogPage * auditEventsPerPage);
    const emailAuditEntries = useMemo(
        () => auditLogEntries.filter(entry => entry.event === 'system_email_sent'),
        [auditLogEntries],
    );
    const emailsPerPage = 12;
    const totalEmailLogPages = Math.max(1, Math.ceil(emailAuditEntries.length / emailsPerPage));
    const pagedEmailEntries = emailAuditEntries.slice((emailLogPage - 1) * emailsPerPage, emailLogPage * emailsPerPage);

    return {
        isLoadingAuditLog,
        auditLogPage,
        setAuditLogPage,
        deletedUsersLog,
        emailLogPage,
        setEmailLogPage,
        fetchAuditLog,
        fetchDeletedUsersLog,
        handleUnblockDeletedUser,
        totalAuditLogPages,
        pagedAuditEntries,
        totalEmailLogPages,
        pagedEmailEntries,
    };
};
