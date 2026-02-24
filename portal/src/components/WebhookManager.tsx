import { useState, useEffect } from "react";
import { Button } from "./ui/button";
import {
  Globe,
  Plus,
  Trash2,
  CheckCircle,
  XCircle,
  Activity,
  Loader2,
  Shield,
} from "lucide-react";
import { clsx } from "clsx";
import { apiRequest } from "../services/apiClient";
import { useConfirmDialog } from "../context/ConfirmDialogContext";

interface Webhook {
  id: string;
  appId: string;
  url: string;
  description?: string;
  events: string[];
  isActive: boolean;
  secret: string;
  createdAt: string;
}

interface WebhookManagerProps {
  appId: string;
  appName: string;
  token: string | null;
}

const AVAILABLE_EVENTS = [
  { id: "notification.sent", label: "Notification Sent" },
  { id: "notification.delivered", label: "Notification Delivered" },
  { id: "notification.failed", label: "Notification Failed" },
  { id: "campaign.completed", label: "Campaign Completed" },
  { id: "abtest.completed", label: "A/B Test Completed" },
];

export function WebhookManager({ appId, appName, token }: WebhookManagerProps) {
  const { confirm } = useConfirmDialog();
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [testStatus, setTestStatus] = useState<
    Record<string, "idle" | "testing" | "success" | "error">
  >({});

  const [formData, setFormData] = useState({
    url: "",
    description: "",
    events: [] as string[],
  });

  const authApiCall = async <T = any,>(
    endpoint: string,
    options: RequestInit = {},
  ): Promise<T> => {
    return apiRequest<T>(endpoint, token, options);
  };

  useEffect(() => {
    loadWebhooks();
  }, [appId]);

  const loadWebhooks = async () => {
    setIsLoading(true);
    try {
      const data = await authApiCall(`/apps/${appId}/env/production/webhooks`);
      // Normalize: backend may return a single config object or an array
      if (data && !Array.isArray(data)) {
        setWebhooks(data.url ? [data] : []);
      } else {
        setWebhooks(Array.isArray(data) ? data : []);
      }
    } catch (error) {
      console.error("Failed to load webhooks:", error);
      setWebhooks([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!formData.url) return;
    setIsSaving(true);
    try {
      await authApiCall(`/apps/${appId}/env/production/webhooks`, {
        method: "PUT",
        body: JSON.stringify(formData),
      });
      setShowAddModal(false);
      setFormData({ url: "", description: "", events: [] });
      await loadWebhooks();
    } catch (error: any) {
      console.error(`Error: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const deleteWebhook = async (_id: string) => {
    const confirmed = await confirm({
      title: "Remove Webhook",
      description: "Are you sure you want to remove this webhook configuration?",
      confirmText: "Remove",
      destructive: true,
    });
    if (!confirmed) return;
    try {
      // Backend uses PUT to configure; to remove, send empty config
      await authApiCall(`/apps/${appId}/env/production/webhooks`, {
        method: "PUT",
        body: JSON.stringify({ url: "", events: [] }),
      });
      await loadWebhooks();
    } catch (error: any) {
      console.error(`Error: ${error.message}`);
    }
  };

  const testWebhook = async (id: string) => {
    setTestStatus({ ...testStatus, [id]: "testing" });
    try {
      await authApiCall(`/apps/${appId}/env/production/webhooks/test`, {
        method: "POST",
      });
      setTestStatus({ ...testStatus, [id]: "success" });
      setTimeout(
        () => setTestStatus((prev) => ({ ...prev, [id]: "idle" })),
        3000,
      );
    } catch (error) {
      setTestStatus({ ...testStatus, [id]: "error" });
      setTimeout(
        () => setTestStatus((prev) => ({ ...prev, [id]: "idle" })),
        5000,
      );
    }
  };

  const toggleEvent = (eventId: string) => {
    setFormData((prev) => ({
      ...prev,
      events: prev.events.includes(eventId)
        ? prev.events.filter((e) => e !== eventId)
        : [...prev.events, eventId],
    }));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Globe className="w-5 h-5 text-blue-600" />
            Webhooks
          </h3>
          <p className="text-sm text-gray-400">
            Receive real-time notifications for events in {appName}
          </p>
        </div>
        <Button onClick={() => setShowAddModal(true)} size="sm">
          <Plus className="w-4 h-4 me-1" /> Add Webhook
        </Button>
      </div>

      {isLoading ? (
        <div className="py-12 flex justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        </div>
      ) : webhooks.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed p-12 text-center text-gray-400">
          <Activity className="w-12 h-12 mx-auto mb-4 opacity-20" />
          <p>No webhooks configured for this app.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {webhooks.map((webhook) => (
            <div
              key={webhook.id}
              className="bg-white rounded-2xl border p-6 flex flex-col md:flex-row gap-6 items-start md:items-center"
            >
              <div className="p-3 rounded-xl bg-blue-50 text-blue-600">
                <Globe className="w-6 h-6" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-1">
                  <h4 className="font-semibold text-gray-900 truncate">
                    {webhook.url}
                  </h4>
                  {webhook.isActive ? (
                    <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                      Active
                    </span>
                  ) : (
                    <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                      Inactive
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-500 line-clamp-1">
                  {webhook.description || "No description"}
                </p>
                <div className="flex flex-wrap gap-2 mt-3">
                  {webhook.events.map((event) => (
                    <span
                      key={event}
                      className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md font-medium"
                    >
                      {event}
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex flex-wrap gap-2 shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => testWebhook(webhook.id)}
                  disabled={testStatus[webhook.id] === "testing"}
                >
                  {testStatus[webhook.id] === "testing" ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : testStatus[webhook.id] === "success" ? (
                    <CheckCircle className="w-4 h-4 text-green-500" />
                  ) : testStatus[webhook.id] === "error" ? (
                    <XCircle className="w-4 h-4 text-red-500" />
                  ) : (
                    "Test"
                  )}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    console.error(`Webhook Secret: ${webhook.secret}`)
                  }
                >
                  <Shield className="w-4 h-4 text-yellow-600" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-red-500 hover:bg-red-50"
                  onClick={() => deleteWebhook(webhook.id)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Webhook Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl w-full max-w-xl overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-200">
            <div className="p-8 border-b">
              <h3 className="text-xl font-bold text-gray-900">
                Configure New Webhook
              </h3>
              <p className="text-sm text-gray-500 mt-1">
                Provide an endpoint to receive NotifyX events
              </p>
            </div>
            <div className="p-8 space-y-6">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Endpoint URL
                </label>
                <input
                  type="url"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none"
                  placeholder="https://your-api.com/webhooks/notifyx"
                  value={formData.url}
                  onChange={(e) =>
                    setFormData({ ...formData, url: e.target.value })
                  }
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Description
                </label>
                <input
                  type="text"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none"
                  placeholder="e.g. Production logging server"
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-3">
                  Event Subscriptions
                </label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {AVAILABLE_EVENTS.map((event) => (
                    <button
                      key={event.id}
                      onClick={() => toggleEvent(event.id)}
                      className={clsx(
                        "flex items-center gap-3 px-4 py-3 rounded-xl border text-start transition-all",
                        formData.events.includes(event.id)
                          ? "bg-blue-50 border-blue-600 text-blue-700 shadow-sm"
                          : "bg-white border-gray-100 text-gray-600 hover:border-gray-200",
                      )}
                    >
                      <div
                        className={clsx(
                          "w-5 h-5 rounded-md border flex items-center justify-center transition-all",
                          formData.events.includes(event.id)
                            ? "bg-blue-600 border-blue-600"
                            : "bg-white border-gray-300",
                        )}
                      >
                        {formData.events.includes(event.id) && (
                          <CheckCircle className="w-3 h-3 text-white" />
                        )}
                      </div>
                      <span className="text-xs font-medium">{event.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="p-8 bg-gray-50 border-t flex justify-end gap-3">
              <Button variant="outline" onClick={() => setShowAddModal(false)}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={isSaving || !formData.url}>
                {isSaving ? "Creating..." : "Create Webhook"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
