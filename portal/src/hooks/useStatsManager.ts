import { useState, useEffect, useCallback } from 'react';
import { statsService } from '../services/statsService';
import { useAuth } from '../context/AuthContext';
import type { Stats } from '../types';

export function useStatsManager() {
    const { token } = useAuth();
    const [stats, setStats] = useState<Stats | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    const loadStats = useCallback(async () => {
        setIsLoading(true);
        try {
            const data = await statsService.getStats(token);
            setStats(data);
        } catch (error) {
            console.error('Failed to load stats:', error);
        } finally {
            setIsLoading(false);
        }
    }, [token]);

    useEffect(() => {
        loadStats();
    }, [loadStats]);

    return { stats, isLoading, refresh: loadStats };
}
