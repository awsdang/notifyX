import { apiRequest } from "./apiClient";

export interface AppApiKey {
  id: string;
  name: string;
  scopes: string[];
  isActive: boolean;
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  createdBy?: string | null;
  rotatedFromId?: string | null;
}

export interface AppApiKeySecret extends AppApiKey {
  apiKey: string;
}

export interface CreateAppApiKeyInput {
  name: string;
  scopes?: string[];
  expiresAt?: string;
}

export interface RotateAppApiKeyInput {
  name?: string;
  scopes?: string[];
  expiresAt?: string;
}

export const apiKeyService = {
  list: (appId: string, token: string | null): Promise<AppApiKey[]> =>
    apiRequest(`/apps/${appId}/api-keys`, token),

  create: (
    appId: string,
    data: CreateAppApiKeyInput,
    token: string | null,
  ): Promise<AppApiKeySecret> =>
    apiRequest(`/apps/${appId}/api-keys`, token, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  revoke: (appId: string, keyId: string, token: string | null) =>
    apiRequest(`/apps/${appId}/api-keys/${keyId}`, token, {
      method: "DELETE",
    }),

  rotate: (
    appId: string,
    keyId: string,
    data: RotateAppApiKeyInput,
    token: string | null,
  ): Promise<AppApiKeySecret> =>
    apiRequest(`/apps/${appId}/api-keys/${keyId}/rotate`, token, {
      method: "POST",
      body: JSON.stringify(data),
    }),
};