import { useState, useEffect, useCallback } from 'react';
import { credentialService, type Credential } from '../services/credentialService';
import { useAuth } from '../context/AuthContext';

export function useCredentials(appId: string) {
    const { token } = useAuth();
    const [credentials, setCredentials] = useState<Credential[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    const loadCredentials = useCallback(async () => {
        if (!appId) return;
        setIsLoading(true);
        try {
            const data = await credentialService.getCredentials(appId, token);
            setCredentials(data);
        } catch (error) {
            console.error('Failed to load credentials:', error);
        } finally {
            setIsLoading(false);
        }
    }, [appId, token]);

    useEffect(() => {
        loadCredentials();
    }, [loadCredentials]);

    const saveCredential = async (data: any) => {
        setIsSaving(true);
        try {
            await credentialService.saveCredential(appId, token, data);
            await loadCredentials();
            return { success: true };
        } catch (error: any) {
            return { success: false, error: error.message };
        } finally {
            setIsSaving(false);
        }
    };

    const deleteCredential = async (provider: string) => {
        try {
            await credentialService.deleteCredential(appId, provider, token);
            await loadCredentials();
        } catch (error: any) {
            alert(`Error: ${error.message}`);
        }
    };

    const toggleCredential = async (provider: string, isActive: boolean) => {
        try {
            await credentialService.toggleCredential(appId, provider, isActive, token);
            await loadCredentials();
        } catch (error: any) {
            alert(`Error: ${error.message}`);
        }
    };

    const testCredential = async (provider: string, testToken: string) => {
        try {
            const result = await credentialService.testCredential(appId, provider, testToken, token);
            return { success: true, message: result.message || 'Test notification sent!' };
        } catch (error: any) {
            return { success: false, message: error.message };
        }
    };

    return {
        credentials,
        isLoading,
        isSaving,
        saveCredential,
        deleteCredential,
        toggleCredential,
        testCredential,
        refresh: loadCredentials,
    };
}
