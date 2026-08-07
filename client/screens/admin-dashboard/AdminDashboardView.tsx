import React from 'react';

import { CustomSelect } from '../../shared/ui';
import { Loader, ToastContainer } from '../../shared/toast';
import { UserCard } from '../admin/UserCard';
import { UserModal } from '../admin/UserModal';
import type { AdminDashboardState } from './useAdminDashboard';

export const AdminDashboardView: React.FC<AdminDashboardState> = ({
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
}) => (
    <div className="w-full flex flex-col gap-6">
        <Loader isLoading={isLoading} />
        <ToastContainer toasts={toasts} setToasts={setToasts} />

        <header className="border-b border-white/10 pb-5">
            <h1 className="text-2xl md:text-3xl font-black text-text tracking-tight">Users</h1>
            <p className="text-sm text-muted mt-1">Manage access, expiry, and sync from {mediaServerLabel}.</p>
        </header>
        <main className="flex flex-col gap-6">
            {isConfigured && (
                <div className="flex flex-col md:flex-row gap-4 md:items-center glass-card-sm p-4">
                    <span className="font-bold text-muted uppercase tracking-wider text-sm hidden md:inline-block mr-2">Quick Actions:</span>
                    <div className="grid grid-cols-2 md:flex md:flex-row gap-3 w-full md:w-auto flex-1">
                        <button className="col-span-2 md:col-span-1 btn-primary !shadow-none" onClick={handleImportUsers} disabled={isLoading}>
                            Sync {mediaServerLabel} Users
                        </button>
                    </div>
                </div>
            )}

            {isConfigured && (
                <div className="flex flex-col xl:flex-row justify-between xl:items-center glass-card-sm p-4 gap-4 xl:gap-6 w-full">
                    <div className="relative w-full xl:w-auto xl:flex-1 min-w-[250px]">
                        <input
                            type="text"
                            placeholder="Search by name, username, or email..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full py-3 pr-10 pl-4 rounded-lg border border-border bg-background text-text text-sm outline-none focus:border-plex focus:ring-1 focus:ring-plex transition-all"
                        />
                        {searchQuery && (
                            <button className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-text text-xl" onClick={() => setSearchQuery('')}>×</button>
                        )}
                    </div>

                    <div className="grid grid-cols-3 sm:flex sm:flex-row bg-black/40 p-1 rounded-lg border border-white/5 overflow-x-auto custom-scrollbar w-full xl:w-auto">
                        {(['all', 'active', 'trial', 'expiring', 'expired', 'revoked'] as const).map((status) => (
                            <button
                                key={status}
                                className={`col-span-1 px-2 sm:px-4 py-2 rounded-md font-medium transition-all text-xs sm:text-sm text-center ${statusFilter === status ? 'bg-plex text-white shadow-lg font-bold' : 'text-muted hover:bg-white/5 hover:text-text'}`}
                                onClick={() => setStatusFilter(status)}
                            >
                                {status.charAt(0).toUpperCase() + status.slice(1)}
                            </button>
                        ))}
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 whitespace-nowrap w-full xl:w-auto xl:ml-auto">
                        <label htmlFor="sortSelect" className="text-muted font-bold text-sm hidden sm:block">Sort By</label>
                        <CustomSelect
                            id="sortSelect"
                            value={sortBy}
                            onChange={(val) => setSortBy(val as typeof sortBy)}
                            className="w-full sm:w-[200px]"
                            options={[
                                { label: 'Username (A-Z)', value: 'username-asc' },
                                { label: 'Username (Z-A)', value: 'username-desc' },
                                { label: 'Expiry (Soonest)', value: 'expiry-asc' },
                                { label: 'Expiry (Furthest)', value: 'expiry-desc' },
                                { label: 'Joined Date (Newest)', value: 'joined-desc' }
                            ]}
                        />
                    </div>
                </div>
            )}

            {selectedUserIds.length > 0 && (
                <div className="glass-card-sm p-4 flex justify-between items-center flex-wrap gap-4 w-full">
                    <div className="flex items-center flex-wrap gap-4 text-sm font-medium">
                        <span className="text-plex">{selectedUserIds.length} selected</span>
                        {allFilteredSelected ? (
                            <button className="text-muted hover:text-text transition-colors underline" onClick={() => setSelectedUserIds(prev => prev.filter(id => !filteredUserIds.includes(id)))}>Unselect Filtered</button>
                        ) : (
                            <button className="text-muted hover:text-text transition-colors underline" onClick={() => setSelectedUserIds(prev => Array.from(new Set([...prev, ...filteredUserIds])))}>Select Filtered ({filteredAndSortedUsers.length})</button>
                        )}
                        <button className="text-muted hover:text-text transition-colors underline" onClick={() => setSelectedUserIds([])}>Unselect All</button>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                        <button className="px-4 py-2 bg-border text-text rounded-md font-medium hover:bg-opacity-80 transition-colors flex items-center justify-center gap-2" onClick={() => handleBulkUpdate('addMonth')}>+1 Month</button>
                        <button className="px-4 py-2 bg-border text-text rounded-md font-medium hover:bg-opacity-80 transition-colors flex items-center justify-center gap-2" onClick={() => handleBulkUpdate('addYear')}>+1 Year</button>
                        <button className="px-4 py-2 bg-border text-text rounded-md font-medium hover:bg-opacity-80 transition-colors flex items-center justify-center gap-2" onClick={() => handleBulkUpdate('unlimited')}>Unlimited</button>
                        <div className="flex items-center gap-2">
                            <input
                                type="date"
                                value={bulkCustomDate}
                                onChange={(e) => setBulkCustomDate(e.target.value)}
                                className="p-2 rounded-md border border-border bg-background text-text text-sm outline-none focus:border-plex cursor-pointer"
                            />
                            <button
                                className="px-4 py-2 bg-plex text-background rounded-md font-medium hover:bg-plex-hover transition-colors flex items-center justify-center gap-2"
                                onClick={() => {
                                    if (!bulkCustomDate) {
                                        addToast('Please select a custom expiry date.', 'error');
                                        return;
                                    }
                                    handleBulkUpdate('custom', bulkCustomDate);
                                }}
                            >
                                Set Custom Date
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {isConfigured && filteredAndSortedUsers.length === 0 && !isLoading && (
                <p className="text-center text-muted p-8 glass-card-sm border-dashed w-full">No users found matching your filters. Try syncing or widening filters.</p>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 w-full">
                {filteredAndSortedUsers.map((user) => (
                    <UserCard
                        key={user.id}
                        user={user}
                        onEdit={() => handleOpenUserModal(user)}
                        onDelete={() => handleDeleteUser(user.id)}
                        onRevoke={() => revokePlexAccess(user.id)}
                        onViewAs={() => handleViewAsUser(user)}
                        isConfigured={isConfigured}
                        isSelected={selectedUserIds.includes(user.id)}
                        onSelect={handleToggleSelection}
                        providerLabel={mediaServerLabel}
                    />
                ))}
            </div>
        </main>
        <UserModal
            isOpen={isUserModalOpen}
            onClose={handleCloseModal}
            onSave={handleSaveUser}
            user={editingUser}
        />
    </div>
);
