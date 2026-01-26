import { useState, useEffect, useCallback } from 'react';
import { appService } from '../services/appService';
import { useAuth } from '../context/AuthContext';
import type { Application } from '../types';

export function useAppManager() {
    const { token } = useAuth();
    const [apps, setApps] = useState<Application[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const loadApps = useCallback(async () => {
        setIsLoading(true);
        try {
            const data = await appService.getApps(token);
            setApps(data);
        } catch (error) {
            console.error('Failed to load apps:', error);
        } finally {
            setIsLoading(false);
        }
    }, [token]);

    useEffect(() => {
        loadApps();
    }, [loadApps]);

    const createApp = async (name: string) => {
        try {
            await appService.createApp(name, token);
            await loadApps();
        } catch (error) {
            console.error('Failed to create app:', error);
        }
    };

    return { apps, isLoading, refresh: loadApps, createApp };
}
