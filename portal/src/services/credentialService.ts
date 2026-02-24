import { apiRequest } from "./apiClient";

/**
 * Credential version returned by the API
 */
export interface CredentialVersion {
  id: string;
  version: number;
  isActive: boolean;
  createdAt: string;
  testRunStatus?: string;
}

/**
 * Credential container returned by the API
 * (versioned credential model with activeVersion)
 */
export interface Credential {
  id: string;
  provider: string;
  activeVersion: {
    id: string;
    version: number;
    createdAt: string;
    createdBy?: string;
  } | null;
  versions: CredentialVersion[];
}

export interface WebSdkViewConfig {
  appId: string;
  env: "PROD" | "UAT";
  hasWebCredential: boolean;
  hasActiveWebCredential: boolean;
  vapidPublicKey: string | null;
}

/** Default environment used when the portal doesn't specify one */
const DEFAULT_ENV = "production";

export const credentialService = {
  /**
   * GET /apps/:appId/env/:env/credentials
   */
  getCredentials: (
    appId: string,
    token: string | null,
    env = DEFAULT_ENV,
  ): Promise<Credential[]> =>
    apiRequest(`/apps/${appId}/env/${env}/credentials`, token),

  /**
   * GET /apps/:appId/env/:env/credentials/view
   * Returns safe values needed for Web SDK setup (no secrets).
   */
  getWebSdkViewConfig: (
    appId: string,
    token: string | null,
    env = DEFAULT_ENV,
  ): Promise<WebSdkViewConfig> =>
    apiRequest(`/apps/${appId}/env/${env}/credentials/view`, token),

  /**
   * POST /apps/:appId/env/:env/credentials/:provider
   * Creates a new credential version for the given provider.
   */
  saveCredential: (
    appId: string,
    token: string | null,
    data: any,
    env = DEFAULT_ENV,
  ) => {
    const { provider, ...credentialData } = data;
    return apiRequest(
      `/apps/${appId}/env/${env}/credentials/${provider}`,
      token,
      {
        method: "POST",
        body: JSON.stringify(credentialData),
      },
    );
  },

  /**
   * POST /credentials/:credentialVersionId/test
   * Tests a specific credential version.
   */
  testCredentialVersion: (
    credentialVersionId: string,
    testToken: string,
    token: string | null,
  ) =>
    apiRequest(`/apps/credentials/${credentialVersionId}/test`, token, {
      method: "POST",
      body: JSON.stringify({ testToken }),
    }),

  /**
   * POST /credentials/:credentialVersionId/activate
   * Activates a specific credential version.
   */
  activateCredentialVersion: (
    credentialVersionId: string,
    token: string | null,
  ) =>
    apiRequest(`/apps/credentials/${credentialVersionId}/activate`, token, {
      method: "POST",
    }),

  /**
   * POST /credentials/:credentialId/deactivate
   * Deactivates current active version(s) for the provider.
   */
  deactivateCredential: (credentialId: string, token: string | null) =>
    apiRequest(`/apps/credentials/${credentialId}/deactivate`, token, {
      method: "POST",
    }),

  /**
   * DELETE /credentials/:credentialId
   * Deletes provider credential container and all versions.
   */
  deleteCredential: (credentialId: string, token: string | null) =>
    apiRequest(`/apps/credentials/${credentialId}`, token, {
      method: "DELETE",
    }),

  /**
   * Creates a demo machine key and returns raw value once.
   */
  createDemoMachineApiKey: (
    appId: string,
    token: string | null,
  ): Promise<{ id: string; apiKey: string; name: string }> =>
    apiRequest(`/apps/${appId}/api-keys`, token, {
      method: "POST",
      body: JSON.stringify({
        name: `Web SDK Demo ${new Date().toISOString()}`,
        scopes: ["users:write", "devices:write", "notifications:test"],
      }),
    }),

  /**
   * POST /credentials/generate-vapid
   * Generates a new VAPID key pair and auto-fills subject from user email.
   */
  generateVapidKeys: (
    token: string | null,
  ): Promise<{
    vapidPublicKey: string;
    vapidPrivateKey: string;
    subject: string;
  }> =>
    apiRequest(`/apps/credentials/generate-vapid`, token, {
      method: "POST",
    }),
};
