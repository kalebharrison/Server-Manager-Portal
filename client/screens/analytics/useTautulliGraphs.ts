import { useEffect, useMemo, useState } from 'react';

import { apiFetch } from '../../shared/api';
import { buildTautulliGraphsData } from './tautulliGraphUtils';

export const useTautulliGraphs = () => {
    const [graphs, setGraphs] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');
    const [days, setDays] = useState('30');
    const [yAxis, setYAxis] = useState<'plays' | 'duration'>('plays');

    useEffect(() => {
        let cancelled = false;
        setIsLoading(true);
        setError('');
        apiFetch(`/api/tautulli/graphs?days=${days}&y_axis=${yAxis}`)
            .then(data => {
                if (cancelled) return;
                setGraphs(data);
                setIsLoading(false);
            })
            .catch(err => {
                if (cancelled) return;
                setError(err.message || 'Failed to load graphs');
                setIsLoading(false);
            });
        return () => { cancelled = true; };
    }, [days, yAxis]);

    const chartData = useMemo(() => {
        if (!graphs || Object.keys(graphs).length === 0) return null;
        return buildTautulliGraphsData(graphs, yAxis);
    }, [graphs, yAxis]);

    return {
        isLoading,
        error,
        days,
        setDays,
        yAxis,
        setYAxis,
        chartData,
    };
};

export type TautulliGraphsState = ReturnType<typeof useTautulliGraphs>;
