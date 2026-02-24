import { Copy, Loader2, RefreshCw, X } from "lucide-react";
import { Button } from "../ui/button";

interface WebSdkCredentialsDialogProps {
  isOpen: boolean;
  providerName?: string;
  appId: string;
  vapidPublicKey: string | null;
  demoMachineApiKey: string;
  isLoading: boolean;
  isGeneratingDemoKey: boolean;
  onClose: () => void;
  onRefresh: () => void;
  onGenerateDemoKey: () => void;
}

export function WebSdkCredentialsDialog({
  isOpen,
  providerName,
  appId,
  vapidPublicKey,
  demoMachineApiKey,
  isLoading,
  isGeneratingDemoKey,
  onClose,
  onRefresh,
  onGenerateDemoKey,
}: WebSdkCredentialsDialogProps) {
  if (!isOpen) return null;

  const copyToClipboard = async (value: string) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // no-op
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-3xl bg-white rounded-3xl border border-slate-200 shadow-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-slate-900">
              Web SDK View Credentials
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Opened from {providerName || "provider"}. Safe values only (no
              private secrets).
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-slate-100 inline-flex items-center justify-center"
            title="Close"
          >
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="flex items-center justify-end">
            <Button
              variant="ghost"
              size="sm"
              className="rounded-lg"
              onClick={onRefresh}
              disabled={isLoading}
            >
              <RefreshCw
                className={`w-3.5 h-3.5 me-1.5 ${isLoading ? "animate-spin" : ""}`}
              />
              Refresh
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">
                App ID (UUID)
              </p>
              <div className="mt-1 flex items-start justify-between gap-2">
                <p className="text-xs font-mono text-slate-700 break-all">
                  {appId}
                </p>
                <button
                  className="text-slate-500 hover:text-slate-800"
                  onClick={() => void copyToClipboard(appId)}
                  title="Copy App ID"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 md:col-span-2">
              <p className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">
                VAPID Public Key
              </p>
              <div className="mt-1 flex items-start justify-between gap-2">
                <p className="text-xs font-mono text-slate-700 break-all">
                  {vapidPublicKey || "Not configured yet"}
                </p>
                <button
                  className="text-slate-500 hover:text-slate-800 disabled:opacity-40"
                  disabled={!vapidPublicKey}
                  onClick={() => void copyToClipboard(vapidPublicKey || "")}
                  title="Copy VAPID Public Key"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 md:col-span-3">
              <div className="flex items-center justify-between gap-3 mb-2">
                <p className="text-[10px] uppercase tracking-widest text-amber-700 font-semibold">
                  Machine API Key (demo only)
                </p>
                <Button
                  size="sm"
                  className="rounded-lg h-7"
                  onClick={onGenerateDemoKey}
                  disabled={isGeneratingDemoKey}
                >
                  {isGeneratingDemoKey ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin me-1.5" />
                  ) : null}
                  Generate
                </Button>
              </div>

              <div className="flex items-start justify-between gap-2">
                <p className="text-xs font-mono text-amber-900 break-all">
                  {demoMachineApiKey || "Generate a key for SDK demo/testing"}
                </p>
                <button
                  className="text-amber-700 hover:text-amber-900 disabled:opacity-40"
                  disabled={!demoMachineApiKey}
                  onClick={() => void copyToClipboard(demoMachineApiKey)}
                  title="Copy Machine API Key"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
              </div>

              <p className="text-[11px] text-amber-800/80 mt-2 leading-relaxed">
                Raw API keys are shown once for security. The key itself stays
                active until revoked/expired. For production, create a
                long-lived key (no expiry) and store it in a secrets manager.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
