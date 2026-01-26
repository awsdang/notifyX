import { apiRequest } from './apiClient';

export interface Credential {
    id: string;
    provider: string;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
}

export const credentialService = {
    getCredentials: (appId: string, token: string | null): Promise<Credential[]> =>
        apiRequest(`/apps/${appId}/credentials`, token),

    saveCredential: (appId: string, token: string | null, data: any) =>
        apiRequest(`/apps/${appId}/credentials`, token, {
            method: 'POST',
            body: JSON.stringify(data),
        }),

    deleteCredential: (appId: string, provider: string, token: string | null) =>
        apiRequest(`/apps/${appId}/credentials/${provider}`, token, { method: 'DELETE' }),

    toggleCredential: (appId: string, provider: string, isActive: boolean, token: string | null) =>
        apiRequest(`/apps/${appId}/credentials/${provider}`, token, {
            method: 'PATCH',
            body: JSON.stringify({ isActive }),
        }),

    testCredential: (appId: string, provider: string, testToken: string, token: string | null) =>
        apiRequest(`/apps/${appId}/credentials/${provider}/test`, token, {
            method: 'POST',
            body: JSON.stringify({ testToken }),
        }),
};
