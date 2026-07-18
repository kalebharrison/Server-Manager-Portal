import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

import { TautulliGraphsContent } from './TautulliGraphsContent';
import { useTautulliGraphs } from './useTautulliGraphs';

export const TautulliGraphsTab: React.FC = () => {
    const graphs = useTautulliGraphs();

    if (graphs.isLoading) {
        return (
            <div className="flex justify-center items-center h-64 glass-card-sm mt-6">
                <RefreshCw className="w-8 h-8 text-plex animate-spin" />
            </div>
        );
    }

    if (graphs.error) {
        return (
            <div className="bg-red-500/10 border border-red-500 text-red-500 p-4 rounded-xl mt-6 flex items-center gap-3">
                <AlertCircle className="w-6 h-6" />
                <span>{graphs.error}</span>
            </div>
        );
    }

    if (!graphs.chartData) {
        return null;
    }

    return <TautulliGraphsContent {...graphs} />;
};
