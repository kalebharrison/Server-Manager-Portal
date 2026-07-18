import React from 'react';

import { BroadcastSettingsTab } from './BroadcastSettingsTab';
import type { User } from '../shared/types';

type BroadcastTabProps = {
    users: User[];
};

export const BroadcastTab: React.FC<BroadcastTabProps> = ({ users }) => (
    <div className="mb-8 animate-fade-in">
        <h3 className="text-xl font-bold text-plex mb-4 border-b border-border pb-2">Broadcast Email</h3>
        <BroadcastSettingsTab users={users} />
    </div>
);
