import { useRef, useState } from "react";
import { Upload, FileJson, FileCode, Loader2, Sparkles } from "lucide-react";
import { Button } from "../ui/button";
import { clsx } from "clsx";
import { PROVIDER_INFO, type ProviderKey } from "./ProviderIcon";
import { useFileUpload } from "../../hooks/useFileUpload";
import { credentialService } from "../../services/credentialService";
import { useAuth } from "../../context/AuthContext";

interface AddProviderModalProps {
  selectedProvider: string | null;
  formData: Record<string, any>;
  isSaving: boolean;
  onClose: () => void;
  onBack: () => void;
  onSelectProvider: (provider: string) => void;
  onFormDataChange: (data: Record<string, any>) => void;
  onSave: () => void;
  availableProviders: string[];
}

export function AddProviderModal({
  selectedProvider,
  formData,
  isSaving,
  onClose,
  onBack,
  onSelectProvider,
  onFormDataChange,
  onSave,
  availableProviders,
}: AddProviderModalProps) {
  const { isDragging, onDragOver, onDragLeave, readFile, setIsDragging } =
    useFileUpload();
  const { token } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isGeneratingVapid, setIsGeneratingVapid] = useState(false);

  const handleFileRead = async (file: File) => {
    try {
      const content = await readFile(file);
      if (selectedProvider === "fcm" && file.name.endsWith(".json")) {
        try {
          const json = JSON.parse(content);
          onFormDataChange({
            projectId: json.project_id || "",
            clientEmail: json.client_email || "",
            privateKey: json.private_key || "",
          });
        } catch (err) {
          console.error("Invalid JSON file");
        }
      } else if (selectedProvider === "apns" && file.name.endsWith(".p8")) {
        onFormDataChange({ ...formData, privateKey: content });
      }
    } catch {
      console.error("Failed to read file");
    }
  };

  const handleGenerateVapidKeys = async () => {
    setIsGeneratingVapid(true);
    try {
      const keys = await credentialService.generateVapidKeys(token);
      onFormDataChange({
        ...formData,
        vapidPublicKey: keys.vapidPublicKey,
        vapidPrivateKey: keys.vapidPrivateKey,
        subject: keys.subject,
      });
    } catch (err: any) {
      console.error(`Failed to generate keys: ${err.message}`);
    } finally {
      setIsGeneratingVapid(false);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileRead(file);
  };

  const providerInfo = selectedProvider
    ? PROVIDER_INFO[selectedProvider as ProviderKey]
    : null;

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200"
      role="dialog"
    >
      <div className="bg-white rounded-[2rem] w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
        <div className="p-8 border-b flex items-center justify-between">
          <div>
            <h3 className="text-xl font-bold text-gray-900">
              Add Push Provider
            </h3>
            <p className="text-sm text-gray-500 mt-1">
              {selectedProvider
                ? `Configure ${providerInfo?.name}`
                : "Select a secure provider"}
            </p>
          </div>
          {providerInfo && (
            <div className={clsx("p-3 rounded-2xl", providerInfo.bgColor)}>
              {(() => {
                const Icon = providerInfo.icon;
                return <Icon className={clsx("w-6 h-6", providerInfo.color)} />;
              })()}
            </div>
          )}
        </div>

        <div className="p-8 overflow-y-auto flex-1">
          {!selectedProvider ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {availableProviders.map((provider) => {
                const info = PROVIDER_INFO[provider as ProviderKey];
                const Icon = info.icon;
                return (
                  <button
                    key={provider}
                    onClick={() => onSelectProvider(provider)}
                    className="flex flex-col gap-4 p-6 rounded-3xl border border-gray-100 hover:border-blue-500 hover:bg-blue-50/30 transition-all text-start relative group overflow-hidden"
                  >
                    <div
                      className={clsx(
                        "w-12 h-12 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform",
                        info.bgColor,
                      )}
                    >
                      <Icon className={clsx("w-6 h-6", info.color)} />
                    </div>
                    <div>
                      <h4 className="font-bold text-gray-900">{info.name}</h4>
                      <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                        {info.description}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="space-y-6">
              {/* File upload zone for FCM / APNS */}
              {(selectedProvider === "fcm" || selectedProvider === "apns") && (
                <div
                  onDragOver={onDragOver}
                  onDragLeave={onDragLeave}
                  onDrop={onDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={clsx(
                    "border-2 border-dashed rounded-3xl p-8 text-center transition-all cursor-pointer group hover:bg-blue-50/50",
                    isDragging
                      ? "border-blue-500 bg-blue-50 scale-102"
                      : "border-gray-100",
                    formData.privateKey
                      ? "bg-green-50/30 border-green-200"
                      : "",
                  )}
                >
                  <input
                    type="file"
                    ref={fileInputRef}
                    className="hidden"
                    accept={(providerInfo as any)?.fileExt}
                    onChange={(e) =>
                      e.target.files?.[0] && handleFileRead(e.target.files[0])
                    }
                  />
                  {formData.privateKey ? (
                    <div className="flex flex-col items-center">
                      <div className="w-12 h-12 bg-green-100 rounded-2xl flex items-center justify-center mb-3">
                        {selectedProvider === "fcm" ? (
                          <FileJson className="w-6 h-6 text-green-600" />
                        ) : (
                          <FileCode className="w-6 h-6 text-green-600" />
                        )}
                      </div>
                      <p className="text-sm font-bold text-green-700">
                        File attached successfully
                      </p>
                      <p className="text-xs text-green-600/60 mt-1">
                        Click or drag another to replace
                      </p>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center">
                      <div className="w-12 h-12 bg-gray-50 rounded-2xl flex items-center justify-center mb-3 group-hover:bg-blue-100 transition-colors">
                        <Upload className="w-6 h-6 text-gray-400 group-hover:text-blue-600" />
                      </div>
                      <p className="text-sm font-bold text-gray-700">
                        Drop your {(providerInfo as any)?.fileLabel} file
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        Or click to browse your computer
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Generate VAPID Keys button for Web Push */}
              {selectedProvider === "web" && (
                <button
                  type="button"
                  onClick={handleGenerateVapidKeys}
                  disabled={isGeneratingVapid}
                  className={clsx(
                    "w-full border-2 border-dashed rounded-3xl p-6 text-center transition-all group",
                    "hover:border-blue-500 hover:bg-blue-50/30 cursor-pointer",
                    formData.vapidPublicKey
                      ? "border-green-200 bg-green-50/30"
                      : "border-gray-100",
                    isGeneratingVapid && "opacity-70 pointer-events-none",
                  )}
                >
                  <div className="flex flex-col items-center">
                    <div
                      className={clsx(
                        "w-12 h-12 rounded-2xl flex items-center justify-center mb-3 transition-colors",
                        formData.vapidPublicKey
                          ? "bg-green-100"
                          : "bg-blue-50 group-hover:bg-blue-100",
                      )}
                    >
                      {isGeneratingVapid ? (
                        <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
                      ) : (
                        <Sparkles
                          className={clsx(
                            "w-6 h-6",
                            formData.vapidPublicKey
                              ? "text-green-600"
                              : "text-blue-600",
                          )}
                        />
                      )}
                    </div>
                    {formData.vapidPublicKey ? (
                      <>
                        <p className="text-sm font-bold text-green-700">
                          Keys generated successfully
                        </p>
                        <p className="text-xs text-green-600/60 mt-1">
                          Click to regenerate a new key pair
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="text-sm font-bold text-gray-700">
                          {isGeneratingVapid
                            ? "Generating..."
                            : "Generate VAPID Keys"}
                        </p>
                        <p className="text-xs text-gray-400 mt-1">
                          Auto-generate a secure P-256 key pair and subject
                        </p>
                      </>
                    )}
                  </div>
                </button>
              )}

              {/* Provider-specific form fields */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {providerInfo?.fields.map((field) => {
                  if (
                    field.key === "privateKey" &&
                    (selectedProvider === "fcm" || selectedProvider === "apns")
                  )
                    return null;

                  return (
                    <div
                      key={field.key}
                      className={clsx(
                        field.type === "textarea" || field.type === "checkbox"
                          ? "col-span-full"
                          : "",
                      )}
                    >
                      <label className="block text-sm font-bold text-gray-700 mb-1.5 ms-1">
                        {field.label}
                      </label>
                      {field.type === "textarea" ? (
                        <textarea
                          value={formData[field.key] || ""}
                          onChange={(e) =>
                            onFormDataChange({
                              ...formData,
                              [field.key]: e.target.value,
                            })
                          }
                          className="w-full px-4 py-3 border border-gray-100 rounded-2xl text-sm font-mono focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all placeholder:text-gray-300"
                          rows={4}
                          placeholder={field.placeholder}
                        />
                      ) : field.type === "checkbox" ? (
                        <label className="flex items-center gap-3 bg-gray-50/50 p-4 rounded-2xl border border-gray-100 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={formData[field.key] || false}
                            onChange={(e) =>
                              onFormDataChange({
                                ...formData,
                                [field.key]: e.target.checked,
                              })
                            }
                            className="w-5 h-5 rounded-lg border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                          <div>
                            <span className="text-sm font-bold text-gray-900">
                              Production Environment
                            </span>
                            <p className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">
                              Enable for live application push gateway
                            </p>
                          </div>
                        </label>
                      ) : (
                        <input
                          type={field.type}
                          value={formData[field.key] || ""}
                          onChange={(e) =>
                            onFormDataChange({
                              ...formData,
                              [field.key]: e.target.value,
                            })
                          }
                          className="w-full px-4 py-3 border border-gray-100 rounded-2xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all placeholder:text-gray-300"
                          placeholder={field.placeholder}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="p-8 bg-gray-50 border-t flex justify-between items-center">
          <Button
            variant="outline"
            className="rounded-xl px-6"
            onClick={selectedProvider ? onBack : onClose}
          >
            {selectedProvider ? "Back" : "Discard"}
          </Button>
          {selectedProvider && (
            <Button
              onClick={onSave}
              disabled={
                isSaving ||
                (!formData.privateKey &&
                  (selectedProvider === "fcm" || selectedProvider === "apns"))
              }
              className="rounded-xl px-8 shadow-lg shadow-blue-500/20"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 me-2 animate-spin" />{" "}
                  Finalizing...
                </>
              ) : (
                "Save Infrastructure"
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
