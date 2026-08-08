import React from 'react';

import { BroadcastSettingsTab } from './BroadcastSettingsTab';
import type { User } from '../shared/types';

type BroadcastTabProps = {
    users: User[];
};

export const BroadcastTab: React.FC<BroadcastTabProps> = ({ users }) => (
    <div className="mb-8 animate-fade-in">
        <BroadcastSettingsTab users={users} />
    </div>
);
