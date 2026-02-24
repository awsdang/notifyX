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
            const created = await appService.createApp(name, token) as Application;
            setApps((prev) => [created, ...prev]);
        } catch (error) {
            console.error('Failed to create app:', error);
            throw error;
        }
    };

    const updateApp = async (id: string, data: { name?: string }) => {
        try {
            const updated = await appService.updateApp(id, data, token);
            setApps((prev) => prev.map((app) => (app.id === id ? updated : app)));
            return updated;
        } catch (error) {
            console.error('Failed to update app:', error);
            throw error;
        }
    };

    const killApp = async (id: string) => {
        try {
            const result = await appService.killApp(id, token);
            setApps((prev) => prev.map((app) => (app.id === id ? result.app : app)));
            return result.app;
        } catch (error) {
            console.error('Failed to kill app:', error);
            throw error;
        }
    };

    const reviveApp = async (id: string) => {
        try {
            const revived = await appService.reviveApp(id, token);
            setApps((prev) => prev.map((app) => (app.id === id ? revived : app)));
            return revived;
        } catch (error) {
            console.error('Failed to revive app:', error);
            throw error;
        }
    };

    return { apps, isLoading, refresh: loadApps, createApp, updateApp, killApp, reviveApp };
}
