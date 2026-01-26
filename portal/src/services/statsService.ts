import { apiRequest } from './apiClient';
import type { Stats } from '../types';

export const statsService = {
    getStats: (token: string | null): Promise<Stats> =>
        apiRequest('/stats', token),
};
