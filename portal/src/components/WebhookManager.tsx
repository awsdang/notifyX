import { useState, useEffect } from "react";
import { Button } from "./ui/button";
import {
  Activity,
  CheckCircle,
  CheckCircle2,
  Clock,
  Globe,
  Loader2,
  Pencil,
  Plus,
  Shield,
  Trash2,
  XCircle,
} from "lucide-react";
import { clsx } from "clsx";
import { apiRequest } from "../services/apiClient";
import { useConfirmDialog } from "../context/ConfirmDialogContext";
import { Badge } from "./ui/Badge";

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

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function WebhookManager({ appId, appName, token }: WebhookManagerProps) {
  const { confirm } = useConfirmDialog();
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingWebhook, setEditingWebhook] = useState<Webhook | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [secretCopied, setSecretCopied] = useState<string | null>(null);
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

  const openEditModal = (webhook: Webhook) => {
    setEditingWebhook(webhook);
    setFormData({
      url: webhook.url,
      description: webhook.description || "",
      events: [...webhook.events],
    });
    setShowAddModal(true);
  };

  const openAddModal = () => {
    setEditingWebhook(null);
    setFormData({ url: "", description: "", events: [] });
    setShowAddModal(true);
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
      setEditingWebhook(null);
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

  const copySecret = (id: string, secret: string) => {
    navigator.clipboard.writeText(secret);
    setSecretCopied(id);
    setTimeout(() => setSecretCopied(null), 2000);
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
          <h3 className="flex items-center gap-2 text-lg font-semibold">
            <Globe className="h-5 w-5 text-blue-600" />
            Webhooks
          </h3>
          <p className="text-sm text-slate-500">
            Receive real-time notifications for events in {appName}
          </p>
        </div>
        <Button onClick={openAddModal} size="sm">
          <Plus className="me-1 h-4 w-4" /> Add Webhook
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        </div>
      ) : webhooks.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 p-12 text-center">
          <Activity className="mx-auto mb-4 h-12 w-12 text-slate-300" />
          <p className="mb-2 font-semibold text-slate-700">No webhooks configured</p>
          <p className="mx-auto mb-6 max-w-md text-sm text-slate-500">
            Webhooks send real-time HTTP callbacks when notification events occur. Add an endpoint to start receiving delivery and engagement events.
          </p>
          <Button onClick={openAddModal} size="sm">
            <Plus className="me-1 h-4 w-4" /> Configure Webhook
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {webhooks.map((webhook) => (
            <div
              key={webhook.id}
              className="rounded-2xl border border-slate-200 bg-white transition-all hover:shadow-md"
            >
              {/* Main webhook info */}
              <div className="flex flex-col gap-4 p-6 md:flex-row md:items-center">
                <div
                  className={clsx(
                    "flex h-12 w-12 shrink-0 items-center justify-center rounded-xl",
                    webhook.isActive ? "bg-blue-50 text-blue-600" : "bg-slate-100 text-slate-400",
                  )}
                >
                  <Globe className="h-6 w-6" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-center gap-3">
                    <h4 className="truncate font-semibold text-slate-900">
                      {webhook.url}
                    </h4>
                    <Badge variant={webhook.isActive ? "success" : "default"} dot>
                      {webhook.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                  <p className="line-clamp-1 text-sm text-slate-500">
                    {webhook.description || "No description"}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {webhook.events.map((event) => {
                      const humanLabel =
                        AVAILABLE_EVENTS.find((e) => e.id === event)?.label ??
                        event
                          .split(".")
                          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
                          .join(" ");
                      return (
                        <span
                          key={event}
                          className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600"
                        >
                          {humanLabel}
                        </span>
                      );
                    })}
                    <span className="flex items-center gap-1 text-xs text-slate-400">
                      <Clock size={12} />
                      Created {formatDate(webhook.createdAt)}
                    </span>
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => testWebhook(webhook.id)}
                    disabled={testStatus[webhook.id] === "testing"}
                    className="gap-1.5"
                  >
                    {testStatus[webhook.id] === "testing" ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Testing
                      </>
                    ) : testStatus[webhook.id] === "success" ? (
                      <>
                        <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />
                        Delivered
                      </>
                    ) : testStatus[webhook.id] === "error" ? (
                      <>
                        <XCircle className="h-3.5 w-3.5 text-rose-500" />
                        Failed
                      </>
                    ) : (
                      "Send Test"
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copySecret(webhook.id, webhook.secret)}
                    className="gap-1.5"
                  >
                    {secretCopied === webhook.id ? (
                      <>
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Shield className="h-3.5 w-3.5 text-amber-600" />
                        Secret
                      </>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openEditModal(webhook)}
                    className="gap-1.5"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-rose-500 hover:bg-rose-50"
                    onClick={() => deleteWebhook(webhook.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              {/* Delivery log preview */}
              <div className="border-t border-slate-100 bg-slate-50/50 px-6 py-3">
                <div className="flex items-center justify-between">
                  <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    <Activity size={12} />
                    Recent Deliveries
                  </p>
                </div>
                <div className="mt-2 flex items-center gap-1.5">
                  {/* Delivery status dots - placeholder visualization */}
                  {Array.from({ length: 10 }).map((_, i) => (
                    <div
                      key={i}
                      className={clsx(
                        "h-2 w-2 rounded-full",
                        i < 8
                          ? "bg-emerald-400"
                          : i < 9
                            ? "bg-amber-400"
                            : "bg-slate-200",
                      )}
                      title={i < 8 ? "Delivered" : i < 9 ? "Slow" : "Pending"}
                    />
                  ))}
                  <span className="ml-2 text-xs text-slate-400">Last 10 attempts</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Webhook Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xl animate-in fade-in zoom-in-95 overflow-hidden rounded-2xl bg-white shadow-2xl duration-200">
            <div className="border-b border-slate-100 p-6">
              <h3 className="text-lg font-bold text-slate-900">
                {editingWebhook ? "Edit Webhook" : "Configure New Webhook"}
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                {editingWebhook
                  ? "Update your webhook endpoint configuration"
                  : "Provide an endpoint to receive NotifyX events"}
              </p>
            </div>
            <div className="space-y-5 p-6">
              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">
                  Endpoint URL
                </label>
                <input
                  type="url"
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                  placeholder="https://your-api.com/webhooks/notifyx"
                  value={formData.url}
                  onChange={(e) =>
                    setFormData({ ...formData, url: e.target.value })
                  }
                />
                <p className="mt-1.5 text-xs text-slate-400">
                  Must be a publicly accessible HTTPS endpoint.
                </p>
              </div>
              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">
                  Description
                </label>
                <input
                  type="text"
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                  placeholder="e.g. Production logging server"
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                />
              </div>
              <div>
                <label className="mb-3 block text-sm font-semibold text-slate-700">
                  Event Subscriptions
                </label>
                <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                  {AVAILABLE_EVENTS.map((event) => (
                    <button
                      key={event.id}
                      type="button"
                      onClick={() => toggleEvent(event.id)}
                      className={clsx(
                        "flex items-center gap-3 rounded-xl border px-4 py-3 text-start transition-all",
                        formData.events.includes(event.id)
                          ? "border-blue-200 bg-blue-50 text-blue-700"
                          : "border-slate-100 bg-white text-slate-600 hover:border-slate-200",
                      )}
                    >
                      <div
                        className={clsx(
                          "flex h-5 w-5 items-center justify-center rounded-md border transition-all",
                          formData.events.includes(event.id)
                            ? "border-blue-600 bg-blue-600"
                            : "border-slate-300 bg-white",
                        )}
                      >
                        {formData.events.includes(event.id) && (
                          <CheckCircle className="h-3 w-3 text-white" />
                        )}
                      </div>
                      <span className="text-xs font-medium">{event.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 border-t border-slate-100 bg-slate-50 p-6">
              <Button
                variant="outline"
                onClick={() => {
                  setShowAddModal(false);
                  setEditingWebhook(null);
                }}
              >
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={isSaving || !formData.url}>
                {isSaving
                  ? "Saving..."
                  : editingWebhook
                    ? "Update Webhook"
                    : "Create Webhook"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
