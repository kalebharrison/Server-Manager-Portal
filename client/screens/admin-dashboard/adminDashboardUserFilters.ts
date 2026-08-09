import { getDaysUntilExpiry } from '../../shared/format';
import type { User } from '../../shared/types';

import type { AdminDiscordFilter, AdminSortBy, AdminStatusFilter } from './adminDashboardTypes';

const hasDiscordId = (user: User) => /^\d{5,32}$/.test(String(user.discordId || '').trim());

export const filterAndSortUsers = (
    users: User[],
    searchQuery: string,
    statusFilter: AdminStatusFilter,
    sortBy: AdminSortBy,
    discordFilter: AdminDiscordFilter = 'all',
): User[] => {
    return users
        .filter(user => {
            const query = searchQuery.toLowerCase().trim();
            if (query) {
                const matchesName = user.username.toLowerCase().includes(query);
                const matchesDisplay = user.displayName?.toLowerCase().includes(query) || false;
                const matchesEmail = user.email?.toLowerCase().includes(query) || false;
                const matchesDiscord = String(user.discordId || '').includes(query);
                if (!matchesName && !matchesDisplay && !matchesEmail && !matchesDiscord) return false;
            }

            if (discordFilter === 'linked' && !hasDiscordId(user)) return false;
            if (discordFilter === 'missing' && hasDiscordId(user)) return false;

            if (statusFilter === 'all') return true;

            const days = getDaysUntilExpiry(user.expiryDate);
            const isRevoked = user.plexAccessStatus === 'revoked';
            const isTrial = user.isTrial === true;

            if (statusFilter === 'trial') return isTrial;
            if (statusFilter === 'revoked') return isRevoked;
            if (isRevoked) return false;

            if (statusFilter === 'active') {
                return days === null || days > 30;
            }
            if (statusFilter === 'expiring') {
                return days !== null && days >= 0 && days <= 30;
            }
            if (statusFilter === 'expired') {
                return days !== null && days < 0;
            }
            return true;
        })
        .sort((a, b) => {
            if (sortBy === 'username-asc') {
                return (a.displayName || a.username).localeCompare(b.displayName || b.username);
            }
            if (sortBy === 'username-desc') {
                return (b.displayName || b.username).localeCompare(a.displayName || a.username);
            }
            if (sortBy === 'joined-desc') {
                return new Date(b.joiningDate).getTime() - new Date(a.joiningDate).getTime();
            }
            if (sortBy === 'expiry-asc') {
                if (a.expiryDate === null) return 1;
                if (b.expiryDate === null) return -1;
                return new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime();
            }
            if (sortBy === 'expiry-desc') {
                if (a.expiryDate === null) return 1;
                if (b.expiryDate === null) return -1;
                return new Date(b.expiryDate).getTime() - new Date(a.expiryDate).getTime();
            }
            return 0;
        });
};
