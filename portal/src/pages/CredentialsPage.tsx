import { useCallback, useEffect, useState } from "react";
import { Key, Plus, Loader2, Shield } from "lucide-react";
import { Button } from "../components/ui/button";
import { useAuth } from "../context/AuthContext";
import { useCredentials } from "../hooks/useCredentials";
import { PROVIDER_INFO } from "../components/credentials/ProviderIcon";
import { CredentialCard } from "../components/credentials/CredentialCard";
import { AddProviderModal } from "../components/credentials/AddProviderModal";
import { TestCredentialModal } from "../components/credentials/TestCredentialModal";
import { WebSdkCredentialsDialog } from "../components/credentials/WebSdkCredentialsDialog";
import {
  credentialService,
  type WebSdkViewConfig,
} from "../services/credentialService";
import { useConfirmDialog } from "../context/ConfirmDialogContext";
import { useScopedTranslation } from "../context/I18nContext";

interface CredentialsPageProps {
  appId: string;
  appName: string;
  onCredentialChange?: () => void;
}

export function CredentialsPage({
  appId,
  appName,
  onCredentialChange,
}: CredentialsPageProps) {
  const tp = useScopedTranslation("pages", "CredentialsPage");
  const { confirm } = useConfirmDialog();
  const { canManageApp, token } = useAuth();
  const {
    credentials,
    isLoading,
    isSaving,
    saveCredential,
    activateVersion,
    deactivateCredential,
    deleteCredential,
    testCredential,
  } = useCredentials(appId);

  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [showTestModal, setShowTestModal] = useState<string | null>(null); // credentialVersionId
  const [testToken, setTestToken] = useState("");
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const [webSdkConfig, setWebSdkConfig] = useState<WebSdkViewConfig | null>(
    null,
  );
  const [isLoadingWebSdkConfig, setIsLoadingWebSdkConfig] = useState(false);
  const [demoMachineApiKey, setDemoMachineApiKey] = useState("");
  const [isGeneratingDemoKey, setIsGeneratingDemoKey] = useState(false);
  const [isWebSdkDialogOpen, setIsWebSdkDialogOpen] = useState(false);
  const [webSdkDialogProvider, setWebSdkDialogProvider] = useState<string>("");

  const loadWebSdkConfig = useCallback(async () => {
    if (!appId) return;
    setIsLoadingWebSdkConfig(true);
    try {
      const config = await credentialService.getWebSdkViewConfig(appId, token);
      setWebSdkConfig(config);
    } catch {
      setWebSdkConfig(null);
    } finally {
      setIsLoadingWebSdkConfig(false);
    }
  }, [appId, token]);

  useEffect(() => {
    void loadWebSdkConfig();
  }, [loadWebSdkConfig]);

  const handleSave = async () => {
    const result = await saveCredential({
      provider: selectedProvider,
      ...formData,
    });
    if (result.success) {
      setShowAddModal(false);
      setSelectedProvider(null);
      setFormData({});
      void loadWebSdkConfig();
      onCredentialChange?.();
    } else {
      console.error(`Error: ${result.error}`);
    }
  };

  const handleTest = async () => {
    if (!showTestModal) return;
    setTestResult(null);
    const result = await testCredential(showTestModal, testToken);
    setTestResult(result);
  };

  const handleGenerateDemoKey = async () => {
    setIsGeneratingDemoKey(true);
    try {
      const created = await credentialService.createDemoMachineApiKey(
        appId,
        token,
      );
      setDemoMachineApiKey(created.apiKey || "");
    } catch (error: any) {
      window.alert(
        error?.message ||
          tp(
            "failedGenerateDemoApiKey",
            "Failed to generate demo machine API key",
          ),
      );
    } finally {
      setIsGeneratingDemoKey(false);
    }
  };

  if (!canManageApp(appId)) {
    return (
      <div className="bg-red-50 border border-red-100 rounded-2xl p-6 text-red-700 flex items-center gap-4">
        <Shield className="w-8 h-8 opacity-40 shrink-0" />
        <div>
          <h4 className="font-bold">
            {tp("accessRestricted", "Access Restricted")}
          </h4>
          <p className="text-sm opacity-80">
            {tp(
              "accessRestrictedDescription",
              "You don't have permission to manage credentials for this app.",
            )}
          </p>
        </div>
      </div>
    );
  }

  const configuredProviders = credentials.map((c) => c.provider);
  const availableProviders = Object.keys(PROVIDER_INFO).filter(
    (p) => !configuredProviders.includes(p),
  );

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-bold flex items-center gap-3">
            <Key className="w-6 h-6 text-blue-600" />
            {tp("infrastructureCredentials", "Infrastructure Credentials")}
          </h3>
          <p className="text-sm text-gray-500 mt-1">
            {tp(
              "infrastructureCredentialsDescription",
              "Securely manage your push provider keys and certificates for {{appName}}",
              { appName },
            )}
          </p>
        </div>
        {availableProviders.length > 0 && (
          <Button
            onClick={() => {
              setSelectedProvider(null);
              setFormData({});
              setShowAddModal(true);
            }}
            className="rounded-xl shadow-lg shadow-blue-500/20"
          >
            <Plus className="w-4 h-4 me-2" />
            {tp("addProvider", "Add Provider")}
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <Loader2 className="w-10 h-10 animate-spin text-blue-600" />
          <p className="text-sm text-gray-400 font-medium">
            {tp("fetchingSecureVault", "Fetching secure vault...")}
          </p>
        </div>
      ) : credentials.length === 0 ? (
        <div className="bg-white rounded-3xl border-2 border-dashed border-gray-100 p-16 text-center">
          <div className="w-20 h-20 bg-gray-50 rounded-3xl flex items-center justify-center mx-auto mb-6">
            <Key className="w-10 h-10 text-gray-300" />
          </div>
          <h4 className="text-lg font-bold text-gray-900 mb-2">
            {tp("configurePushProviders", "Configure Push Providers")}
          </h4>
          <p className="text-gray-400 mb-8 max-w-sm mx-auto">
            {tp(
              "configurePushProvidersDescription",
              "Upload your APNs auth keys or Firebase service account to start sending notifications.",
            )}
          </p>
          <Button
            onClick={() => {
              setSelectedProvider(null);
              setFormData({});
              setShowAddModal(true);
            }}
            size="lg"
            className="rounded-2xl"
          >
            <Plus className="w-5 h-5 me-2" />
            {tp("configureFirstProvider", "Configure My First Provider")}
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {credentials.map((cred) => (
            <CredentialCard
              key={cred.id}
              credential={cred}
              onActivateVersion={async (versionId) => {
                await activateVersion(versionId);
                void loadWebSdkConfig();
                onCredentialChange?.();
              }}
              onOpenTest={(credentialVersionId) => {
                setShowTestModal(credentialVersionId);
                setTestToken("");
                setTestResult(null);
              }}
              onOpenWebSdkView={(provider) => {
                setWebSdkDialogProvider(provider);
                setIsWebSdkDialogOpen(true);
                void loadWebSdkConfig();
              }}
              onEdit={(provider) => {
                setSelectedProvider(provider);
                setFormData({});
                setShowAddModal(true);
              }}
              onDeactivate={async (credentialId) => {
                const confirmed = await confirm({
                  title: tp("deactivateProviderTitle", "Deactivate Provider"),
                  description: tp(
                    "deactivateProviderDescription",
                    "Deactivate this provider? You can activate a version again later.",
                  ),
                  confirmText: tp("deactivate", "Deactivate"),
                  destructive: true,
                });
                if (!confirmed) return;
                const result = await deactivateCredential(credentialId);
                if (!result.success) {
                  window.alert(
                    result.error ||
                      tp(
                        "failedDeactivateCredential",
                        "Failed to deactivate credential",
                      ),
                  );
                }
                void loadWebSdkConfig();
                onCredentialChange?.();
              }}
              onDelete={async (credentialId) => {
                const confirmed = await confirm({
                  title: tp("deleteProviderTitle", "Delete Provider"),
                  description: tp(
                    "deleteProviderDescription",
                    "Delete this provider and all its versions? This cannot be undone.",
                  ),
                  confirmText: tp("delete", "Delete"),
                  destructive: true,
                });
                if (!confirmed) return;
                const result = await deleteCredential(credentialId);
                if (!result.success) {
                  window.alert(
                    result.error ||
                      tp("failedDeleteCredential", "Failed to delete credential"),
                  );
                }
                void loadWebSdkConfig();
                onCredentialChange?.();
              }}
            />
          ))}
        </div>
      )}

      {showAddModal && (
        <AddProviderModal
          selectedProvider={selectedProvider}
          formData={formData}
          isSaving={isSaving}
          availableProviders={availableProviders}
          onClose={() => {
            setShowAddModal(false);
            setSelectedProvider(null);
            setFormData({});
          }}
          onBack={() => {
            setSelectedProvider(null);
            setFormData({});
          }}
          onSelectProvider={setSelectedProvider}
          onFormDataChange={setFormData}
          onSave={handleSave}
        />
      )}

      {showTestModal && (
        <TestCredentialModal
          provider={showTestModal}
          testToken={testToken}
          testResult={testResult}
          onTokenChange={setTestToken}
          onTest={handleTest}
          onClose={() => setShowTestModal(null)}
        />
      )}

      <WebSdkCredentialsDialog
        isOpen={isWebSdkDialogOpen}
        providerName={webSdkDialogProvider}
        appId={appId}
        vapidPublicKey={webSdkConfig?.vapidPublicKey || null}
        demoMachineApiKey={demoMachineApiKey}
        isLoading={isLoadingWebSdkConfig}
        isGeneratingDemoKey={isGeneratingDemoKey}
        onRefresh={() => void loadWebSdkConfig()}
        onGenerateDemoKey={() => void handleGenerateDemoKey()}
        onClose={() => setIsWebSdkDialogOpen(false)}
      />
    </div>
  );
}
