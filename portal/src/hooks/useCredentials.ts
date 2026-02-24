import { useState, useEffect, useCallback } from "react";
import {
  credentialService,
  type Credential,
} from "../services/credentialService";
import { useAuth } from "../context/AuthContext";

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
      console.error("Failed to load credentials:", error);
    } finally {
      setIsLoading(false);
    }
  }, [appId, token]);

  useEffect(() => {
    loadCredentials();
  }, [loadCredentials]);

  /**
   * Create a new credential version for a provider.
   */
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

  /**
   * Activate a specific credential version by its ID.
   */
  const activateVersion = async (credentialVersionId: string) => {
    try {
      await credentialService.activateCredentialVersion(
        credentialVersionId,
        token,
      );
      await loadCredentials();
    } catch (error: any) {
      console.error(`Error: ${error.message}`);
    }
  };

  const deactivateCredential = async (credentialId: string) => {
    try {
      await credentialService.deactivateCredential(credentialId, token);
      await loadCredentials();
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  };

  const deleteCredential = async (credentialId: string) => {
    try {
      await credentialService.deleteCredential(credentialId, token);
      await loadCredentials();
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  };

  /**
   * Test a specific credential version by its ID.
   */
  const testCredential = async (
    credentialVersionId: string,
    testToken: string,
  ) => {
    try {
      const result = await credentialService.testCredentialVersion(
        credentialVersionId,
        testToken,
        token,
      );
      return {
        success: true,
        message: result?.message || "Test notification sent!",
      };
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  };

  return {
    credentials,
    isLoading,
    isSaving,
    saveCredential,
    activateVersion,
    deactivateCredential,
    deleteCredential,
    testCredential,
    refresh: loadCredentials,
  };
}
