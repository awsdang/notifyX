import { apiRequest } from './apiClient';
import type { Application } from '../types';

export const appService = {
    getApps: (token: string | null): Promise<Application[]> =>
        apiRequest('/apps', token),

    createApp: (name: string, token: string | null) =>
        apiRequest('/apps', token, {
            method: 'POST',
            body: JSON.stringify({ name }),
        }),
};
