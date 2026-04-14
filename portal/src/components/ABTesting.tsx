import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart3,
  Download,
  FlaskConical,
  ImagePlus,
  Loader2,
  Pencil,
  Plus,
  Send,
  Trash2,
  Upload,
  Users,
  XCircle,
} from "lucide-react";
import { clsx } from "clsx";
import { Button } from "./ui/button";
import { NotificationPreview } from "./NotificationPreview";
import { useConfirmDialog } from "../context/ConfirmDialogContext";
import { useI18n, useScopedTranslation } from "../context/I18nContext";
import { getUserIdentityLabel } from "../lib/userIdentity";
import { useAppTestTargetUsers } from "../hooks/useAppTestTargetUsers";

function getApiBaseUrl(): string {
  const configured = import.meta.env.VITE_API_URL || "http://localhost:3000";
  return configured.endsWith("/api/v1")
    ? configured
    : `${configured.replace(/\/$/, "")}/api/v1`;
}

const API_URL = getApiBaseUrl();
const API_KEY = import.meta.env.VITE_API_KEY || "";

interface ABTestVariant {
  id?: string;
  name: string;
  weight: number;
  title: string;
  subtitle?: string;
  body: string;
  image?: string;
  sentCount?: number;
  deliveredCount?: number;
  failedCount?: number;
}

interface ABTest {
  id: string;
  appId: string;
  name: string;
  description?: string;
  status: "DRAFT" | "ACTIVE" | "COMPLETED" | "CANCELLED";
  targetingMode: "ALL" | "USER_LIST" | "CSV";
  targetUserIds?: string[];
  scheduledAt?: string;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
  hasTestPhase?: boolean;
  lastTestedAt?: string | null;
  variants: ABTestVariant[];
  _count?: { assignments: number };
}

interface ABTestHistoryDelivery {
  deliveryId: string;
  userId: string;
  deviceId: string;
  platform: string;
  provider: string;
  status: string;
  sentAt?: string;
  createdAt: string;
  updatedAt: string;
  error?: string | null;
}

interface ABTestHistoryItem {
  notificationId: string;
  phase: "TEST" | "LIVE";
  mode: "test" | "live";
  variantId?: string;
  variantName: string;
  status: string;
  createdAt: string;
  sendAt?: string;
  deliveries: ABTestHistoryDelivery[];
}

interface ABTestingProps {
  apps: { id: string; name: string }[];
  token: string | null;
}

type AuthApiCall = <T = unknown>(endpoint: string, options?: RequestInit) => Promise<T>;

export function ABTesting({ apps, token }: ABTestingProps) {
  const ta = useScopedTranslation("components", "ABTesting");
  const { language } = useI18n();
  const tt = useCallback(
    (
      key: string,
      params?: Record<string, string | number>,
      fallback?: string,
    ) => ta(key, fallback || key, params),
    [ta],
  );
  const { confirm } = useConfirmDialog();
  const [tests, setTests] = useState<ABTest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const allowedAppIds = useMemo(() => new Set(apps.map((app) => app.id)), [apps]);
  const [editorState, setEditorState] = useState<
    | { mode: "create" }
    | {
        mode: "edit";
        test: ABTest;
      }
    | null
  >(null);

  const [selectedTest, setSelectedTest] = useState<ABTest | null>(null);
  const [showResultsModal, setShowResultsModal] = useState(false);
  const [variantPreview, setVariantPreview] = useState<{
    testName: string;
    variant: ABTestVariant;
  } | null>(null);

  const [scheduleTarget, setScheduleTarget] = useState<ABTest | null>(null);
  const [scheduleAtLocal, setScheduleAtLocal] = useState("");
  const [isScheduling, setIsScheduling] = useState(false);

  const [historyTarget, setHistoryTarget] = useState<ABTest | null>(null);
  const [historyItems, setHistoryItems] = useState<ABTestHistoryItem[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const formatDate = useCallback(
    (value?: string | null) => {
      if (!value) return "-";
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return "-";
      return date.toLocaleString(language === "ar" ? "ar" : "en-US");
    },
    [language],
  );

  const getPhaseLabel = useCallback(
    (phase: "TEST" | "LIVE") =>
      phase === "TEST" ? tt("Test phase") : tt("Live phase"),
    [tt],
  );

  const getStatusLabel = useCallback(
    (status: string) => tt(`deliveryStatus_${status.toUpperCase()}`, undefined, status),
    [tt],
  );

  const getPlatformLabel = useCallback(
    (platform: string) =>
      tt(`platform_${platform.toLowerCase()}`, undefined, platform.toUpperCase()),
    [tt],
  );

  const getProviderLabel = useCallback(
    (provider: string) =>
      tt(`provider_${provider.toLowerCase()}`, undefined, provider.toUpperCase()),
    [tt],
  );

  const authApiCall = useCallback<AuthApiCall>(
    async <T = unknown,>(endpoint: string, options: RequestInit = {}) => {
      const headers = new Headers(options.headers);
      const isFormData = options.body instanceof FormData;

      if (!isFormData && !headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json");
      }
      if (token && !headers.has("Authorization")) {
        headers.set("Authorization", `Bearer ${token}`);
      }
      if (API_KEY && !headers.has("X-API-Key")) {
        headers.set("X-API-Key", API_KEY);
      }

      const response = await fetch(`${API_URL}${endpoint}`, {
        ...options,
        headers,
      });

      const json = await response.json().catch(() => null);
      if (!response.ok) {
        const message =
          json?.message ||
          json?.error?.message ||
          json?.error ||
          tt("Request failed");
        throw new Error(message);
      }

      if (
        json &&
        typeof json === "object" &&
        "error" in json &&
        "data" in json
      ) {
        return json.data as T;
      }

      if (
        json &&
        typeof json === "object" &&
        "success" in json &&
        "data" in json
      ) {
        return json.data as T;
      }

      return json as T;
    },
    [token, tt],
  );

  const loadTests = useCallback(async () => {
    try {
      setIsLoading(true);
      setListError(null);
      const data = await authApiCall<ABTest[]>(
        `/ab-tests?ts=${encodeURIComponent(Date.now().toString())}`,
      );
      const list = Array.isArray(data) ? data : [];
      setTests(list.filter((test) => allowedAppIds.has(test.appId)));
    } catch (error: any) {
      console.error("Failed to load A/B tests:", error);
      setTests([]);
      setListError(error?.message || tt("Failed to load A/B tests."));
    } finally {
      setIsLoading(false);
    }
  }, [allowedAppIds, authApiCall, tt]);

  useEffect(() => {
    void loadTests();
  }, [loadTests]);

  const deleteTest = async (id: string) => {
    const confirmed = await confirm({
      title: tt("Delete A/B Test"),
      description: tt("Are you sure you want to delete this A/B test?"),
      confirmText: tt("Delete Test"),
      destructive: true,
    });
    if (!confirmed) return;
    try {
      await authApiCall(`/ab-tests/${id}`, { method: "DELETE" });
      void loadTests();
    } catch (error: any) {
      console.error(`Error: ${error.message}`);
    }
  };

  const cancelTest = async (id: string) => {
    const confirmed = await confirm({
      title: tt("Cancel A/B Test"),
      description: tt("Are you sure you want to cancel this A/B test?"),
      confirmText: tt("Cancel Test"),
      destructive: true,
    });
    if (!confirmed) return;
    try {
      await authApiCall(`/ab-tests/${id}/cancel`, { method: "POST" });
      void loadTests();
    } catch (error: any) {
      console.error(`Error: ${error.message}`);
    }
  };

  const viewResults = async (id: string) => {
    try {
      const data = await authApiCall<{ test: Partial<ABTest> }>(
        `/ab-tests/${id}/results`,
      );
      const existing = tests.find((test) => test.id === id);
      if (!existing) return;
      setSelectedTest({ ...existing, ...data.test });
      setShowResultsModal(true);
    } catch (error: any) {
      console.error(`Error: ${error.message}`);
    }
  };

  const openScheduleModal = (test: ABTest) => {
    setScheduleTarget(test);
    setScheduleAtLocal("");
  };

  const scheduleLive = async () => {
    if (!scheduleTarget) return;
    setIsScheduling(true);
    try {
      await authApiCall(`/ab-tests/${scheduleTarget.id}/schedule-live`, {
        method: "POST",
        body: JSON.stringify({
          sendAt: scheduleAtLocal
            ? new Date(scheduleAtLocal).toISOString()
            : undefined,
        }),
      });
      setScheduleTarget(null);
      setScheduleAtLocal("");
      void loadTests();
    } catch (error: any) {
      console.error(`Error: ${error.message}`);
    } finally {
      setIsScheduling(false);
    }
  };

  const openHistory = async (test: ABTest) => {
    setHistoryTarget(test);
    setHistoryItems([]);
    setHistoryError(null);
    setIsLoadingHistory(true);
    try {
      const data = await authApiCall<{ history: ABTestHistoryItem[] }>(
        `/ab-tests/${test.id}/history`,
      );
      setHistoryItems(Array.isArray(data.history) ? data.history : []);
    } catch (error: any) {
      setHistoryError(error?.message || tt("Failed to load history."));
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const escapeCsvValue = (value: unknown) => {
    const normalized = value == null ? "" : String(value);
    return `"${normalized.replace(/"/g, '""')}"`;
  };

  const exportHistoryCsv = () => {
    if (!historyTarget || historyItems.length === 0) return;

    const headers = [
      "testId",
      "testName",
      "phase",
      "mode",
      "notificationId",
      "variantName",
      "notificationStatus",
      "notificationCreatedAt",
      "notificationSendAt",
      "userId",
      "deviceId",
      "platform",
      "provider",
      "deliveryStatus",
      "deliverySentAt",
      "deliveryCreatedAt",
      "deliveryUpdatedAt",
      "error",
    ];

    const rows: string[] = [headers.map(escapeCsvValue).join(",")];

    for (const item of historyItems) {
      if (item.deliveries.length === 0) {
        rows.push(
          [
            historyTarget.id,
            historyTarget.name,
            item.phase,
            item.mode,
            item.notificationId,
            item.variantName,
            item.status,
            item.createdAt,
            item.sendAt || "",
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            "",
          ]
            .map(escapeCsvValue)
            .join(","),
        );
        continue;
      }

      for (const delivery of item.deliveries) {
        rows.push(
          [
            historyTarget.id,
            historyTarget.name,
            item.phase,
            item.mode,
            item.notificationId,
            item.variantName,
            item.status,
            item.createdAt,
            item.sendAt || "",
            delivery.userId,
            delivery.deviceId,
            delivery.platform,
            delivery.provider,
            delivery.status,
            delivery.sentAt || "",
            delivery.createdAt,
            delivery.updatedAt,
            delivery.error || "",
          ]
            .map(escapeCsvValue)
            .join(","),
        );
      }
    }

    const csv = rows.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `abtest-history-${historyTarget.id}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const getDisplayStatus = (test: ABTest) => {
    if (test.status === "COMPLETED" || test.status === "CANCELLED") {
      return {
        label: tt("status_finished", undefined, "Finished"),
        className: "bg-green-100 text-green-700",
      };
    }
    if (test.status === "ACTIVE") {
      return {
        label: tt("status_sent", undefined, "Sent"),
        className: "bg-blue-100 text-blue-700",
      };
    }
    if (test.hasTestPhase) {
      return {
        label: tt("status_tested", undefined, "Tested"),
        className: "bg-amber-100 text-amber-700",
      };
    }
    return {
      label: tt("status_draft", undefined, "Draft"),
      className: "bg-slate-100 text-slate-700",
    };
  };

  if (editorState) {
    return (
      <ABTestEditorPage
        mode={editorState.mode}
        initialTest={editorState.mode === "edit" ? editorState.test : null}
        apps={apps}
        token={token}
        authApiCall={authApiCall}
        onBack={() => setEditorState(null)}
        onSaved={() => {
          setEditorState(null);
          void loadTests();
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold">{tt("A/B Testing")}</h3>
          <p className="text-sm text-gray-500">
            {tt("Test different notification variants to optimize engagement")}
          </p>
        </div>
        <Button onClick={() => setEditorState({ mode: "create" })}>
          <Plus className="w-4 h-4 me-2" /> {tt("Create A/B Test")}
        </Button>
      </div>

      {isLoading ? (
        <div className="bg-white rounded-xl border p-12 text-center text-gray-400">
          {tt("Loading...")}
        </div>
      ) : listError ? (
        <div className="bg-rose-50 rounded-xl border border-rose-200 p-8 text-center text-rose-700">
          <p className="font-medium">{tt("Failed to load A/B tests")}</p>
          <p className="text-sm mt-1">{listError}</p>
          <div className="mt-4">
            <Button variant="outline" onClick={() => void loadTests()}>
              {tt("Retry")}
            </Button>
          </div>
        </div>
      ) : tests.length === 0 ? (
        <div className="bg-white rounded-xl border p-12 text-center text-gray-400">
          <FlaskConical className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>{tt("No A/B tests yet.")}</p>
          <p className="text-sm mt-2">{tt("Create your first A/B test to compare notification variants.")}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {tests.map((test) => {
            const status = getDisplayStatus(test);
            const firstVariant = test.variants[0];
            return (
              <div
                key={test.id}
                className="bg-white rounded-xl border p-6 hover:shadow-md transition-shadow"
              >
                <div className="flex justify-between gap-4 items-start mb-4">
                  <div className="space-y-2 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-semibold text-lg truncate">{test.name}</h4>
                      <span
                        className={clsx(
                          "text-xs px-2 py-0.5 rounded-full font-medium capitalize",
                          status.className,
                        )}
                      >
                        {status.label}
                      </span>
                    </div>
                    {test.description && (
                      <p className="text-sm text-gray-500">{test.description}</p>
                    )}
                    {firstVariant?.body && (
                      <p className="text-sm text-slate-700 line-clamp-2">
                        {firstVariant.body}
                      </p>
                    )}
                    <div className="text-xs text-slate-500 grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <span>
                        {tt("Created")}: {formatDate(test.createdAt)}
                      </span>
                      <span>
                        {tt("Scheduled")}: {formatDate(test.scheduledAt)}
                      </span>
                      <span>
                        {tt("Last tested")}: {formatDate(test.lastTestedAt || undefined)}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 shrink-0 justify-end">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setEditorState({ mode: "edit", test })}
                    >
                      <Pencil className="w-4 h-4 me-1" /> {tt("Edit")}
                    </Button>

                    {test.status === "DRAFT" && (
                      <Button size="sm" onClick={() => openScheduleModal(test)}>
                        <Send className="w-4 h-4 me-1" /> {tt("Schedule Live")}
                      </Button>
                    )}

                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void openHistory(test)}
                    >
                      <BarChart3 className="w-4 h-4 me-1" /> {tt("History")}
                    </Button>

                    {(test.status === "ACTIVE" || test.status === "COMPLETED") && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => viewResults(test.id)}
                      >
                        {tt("Results")}
                      </Button>
                    )}

                    {test.status === "ACTIVE" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => cancelTest(test.id)}
                      >
                        <XCircle className="w-4 h-4 me-1" /> {tt("Cancel")}
                      </Button>
                    )}

                    {(test.status === "DRAFT" || test.status === "CANCELLED") && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => deleteTest(test.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                  {test.variants.map((variant) => (
                    <button
                      key={variant.id || variant.name}
                      onClick={() => setVariantPreview({ testName: test.name, variant })}
                      className="p-3 rounded-lg text-start transition-colors border bg-gray-50 border-transparent hover:bg-gray-100"
                    >
                      <div className="flex justify-between items-center mb-1">
                        <span className="font-medium text-sm">
                          {tt("Variant")} {variant.name}
                        </span>
                        <span className="text-xs text-gray-400">{variant.weight}%</span>
                      </div>
                      <p className="text-xs text-gray-600 line-clamp-1">{variant.title}</p>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {variantPreview && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-[90vw] h-[90vh] overflow-auto">
            <h3 className="text-lg font-semibold mb-1">
              {tt("Variant")} {variantPreview.variant.name} {tt("Preview")}
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              {tt("Test")}: {variantPreview.testName}
            </p>
            <div className="h-[calc(90vh-170px)] flex items-center justify-center">
              <NotificationPreview
                platform="android"
                title={variantPreview.variant.title || tt("Title")}
                subtitle={variantPreview.variant.subtitle}
                body={variantPreview.variant.body || ""}
                image={variantPreview.variant.image}
              />
            </div>
            <div className="mt-4 flex justify-end">
              <Button variant="outline" onClick={() => setVariantPreview(null)}>
                {tt("Close")}
              </Button>
            </div>
          </div>
        </div>
      )}

      {showResultsModal && selectedTest && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-auto">
            <div className="p-6 border-b">
              <h3 className="text-lg font-semibold">
                {tt("A/B Test Results")}: {selectedTest.name}
              </h3>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-2 gap-4 mb-6">
                {selectedTest.variants.map((v) => {
                  const total = v.sentCount || 0;
                  const delivered = v.deliveredCount || 0;
                  const rate = total > 0 ? Math.round((delivered / total) * 100) : 0;
                  return (
                    <div key={v.id || v.name} className="bg-gray-50 rounded-xl p-4">
                      <div className="flex justify-between items-center mb-2">
                        <h4 className="font-semibold">
                          {tt("Variant")} {v.name}
                        </h4>
                        <span className="text-sm text-gray-500">{v.weight}%</span>
                      </div>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-500">{tt("Sent")}</span>
                          <span className="font-medium">{v.sentCount || 0}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">{tt("Delivered")}</span>
                          <span className="font-medium text-green-600">
                            {v.deliveredCount || 0}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">{tt("Failed")}</span>
                          <span className="font-medium text-red-600">{v.failedCount || 0}</span>
                        </div>
                        <div className="flex justify-between pt-2 border-t">
                          <span className="text-gray-500">{tt("Delivery Rate")}</span>
                          <span className="font-bold text-lg">{rate}%</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="p-6 border-t bg-gray-50 flex justify-end">
              <Button variant="outline" onClick={() => setShowResultsModal(false)}>
                {tt("Close")}
              </Button>
            </div>
          </div>
        </div>
      )}

      {scheduleTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg">
            <h3 className="text-lg font-semibold">{tt("Schedule Live A/B Test")}</h3>
            <p className="text-sm text-slate-600 mt-1">
              {tt("This schedules the test to run in live mode for all users.")}
            </p>

            <div className="mt-4">
              <label className="block text-sm font-semibold mb-2">
                {tt("Send at (optional, leave empty for now)")}
              </label>
              <input
                type="datetime-local"
                className="w-full h-12 px-4 border border-slate-200 rounded-xl text-sm"
                value={scheduleAtLocal}
                onChange={(event) => setScheduleAtLocal(event.target.value)}
              />
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setScheduleTarget(null)}>
                {tt("Cancel")}
              </Button>
              <Button onClick={() => void scheduleLive()} disabled={isScheduling}>
                {isScheduling ? tt("Scheduling...") : tt("Schedule Live")}
              </Button>
            </div>
          </div>
        </div>
      )}

      {historyTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-5xl max-h-[92vh] overflow-auto">
            <div className="p-6 border-b flex items-center justify-between gap-3">
              <h3 className="text-lg font-semibold">
                {tt("History")}: {historyTarget.name}
              </h3>
              <Button
                variant="outline"
                size="sm"
                onClick={exportHistoryCsv}
                disabled={historyItems.length === 0}
              >
                <Download className="w-4 h-4 me-1" />
                {tt("Export CSV")}
              </Button>
            </div>
            <div className="p-6 space-y-4">
              {isLoadingHistory ? (
                <div className="text-sm text-slate-500">{tt("Loading history...")}</div>
              ) : historyError ? (
                <div className="text-sm text-rose-600">{historyError}</div>
              ) : historyItems.length === 0 ? (
                <div className="text-sm text-slate-500">{tt("No history yet.")}</div>
              ) : (
                historyItems.map((item) => (
                  <div key={item.notificationId} className="border rounded-xl p-4">
                    <div className="flex flex-wrap gap-3 text-xs text-slate-600 mb-3">
                      <span
                        className={clsx(
                          "inline-flex items-center gap-1 px-2 py-0.5 rounded font-medium",
                          item.phase === "TEST"
                            ? "bg-amber-100 text-amber-800"
                            : "bg-blue-100 text-blue-800",
                        )}
                      >
                        {item.phase === "TEST" ? (
                          <FlaskConical className="w-3 h-3" />
                        ) : (
                          <Send className="w-3 h-3" />
                        )}
                        {getPhaseLabel(item.phase)}
                      </span>
                      <span>
                        {tt("Variant")}: {item.variantName}
                      </span>
                      <span>
                        {tt("Status")}: {getStatusLabel(item.status)}
                      </span>
                      <span>
                        {tt("Created")}: {formatDate(item.createdAt)}
                      </span>
                      <span>
                        {tt("Send At")}: {formatDate(item.sendAt)}
                      </span>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-start text-slate-500 border-b">
                            <th className="py-2 pe-2">{tt("User")}</th>
                            <th className="py-2 pe-2">{tt("Device")}</th>
                            <th className="py-2 pe-2">{tt("Platform")}</th>
                            <th className="py-2 pe-2">{tt("Provider")}</th>
                            <th className="py-2 pe-2">{tt("Status")}</th>
                            <th className="py-2 pe-2">{tt("Sent Time")}</th>
                            <th className="py-2 pe-2">{tt("Error")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {item.deliveries.map((delivery) => (
                            <tr key={delivery.deliveryId} className="border-b border-slate-100">
                              <td className="py-2 pe-2 font-mono">{delivery.userId}</td>
                              <td className="py-2 pe-2 font-mono">{delivery.deviceId}</td>
                              <td className="py-2 pe-2">
                                {getPlatformLabel(delivery.platform)}
                              </td>
                              <td className="py-2 pe-2">
                                {getProviderLabel(delivery.provider)}
                              </td>
                              <td className="py-2 pe-2">
                                {getStatusLabel(delivery.status)}
                              </td>
                              <td className="py-2 pe-2">{formatDate(delivery.sentAt || delivery.updatedAt)}</td>
                              <td className="py-2 pe-2 text-rose-600">{delivery.error || "-"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="p-6 border-t bg-gray-50 flex justify-end">
              <Button variant="outline" onClick={() => setHistoryTarget(null)}>
                {tt("Close")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ABTestEditorPage({
  mode,
  initialTest,
  apps,
  token,
  onBack,
  onSaved,
  authApiCall,
}: {
  mode: "create" | "edit";
  initialTest: ABTest | null;
  apps: { id: string; name: string }[];
  token: string | null;
  onBack: () => void;
  onSaved: () => void;
  authApiCall: AuthApiCall;
}) {
  const ta = useScopedTranslation("components", "ABTesting");
  const tt = useCallback(
    (
      key: string,
      params?: Record<string, string | number>,
      fallback?: string,
    ) => ta(key, fallback || key, params),
    [ta],
  );
  const [formData, setFormData] = useState({
    appId: initialTest?.appId || "",
    name: initialTest?.name || "",
    description: initialTest?.description || "",
    targetingMode: (initialTest?.targetingMode || "ALL") as "ALL" | "USER_LIST",
    targetUserIds: initialTest?.targetUserIds || ([] as string[]),
    testUserIds: [] as string[],
  });

  const [variants, setVariants] = useState<ABTestVariant[]>(
    initialTest?.variants?.length
      ? initialTest.variants.map((variant) => ({
          name: variant.name,
          weight: variant.weight,
          title: variant.title,
          subtitle: variant.subtitle,
          body: variant.body,
          image: variant.image,
        }))
      : [
          { name: "A", weight: 50, title: "", body: "" },
          { name: "B", weight: 50, title: "", body: "" },
        ],
  );

  const [previewVariant, setPreviewVariant] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState<{
    type: "error" | "success";
    message: string;
  } | null>(null);

  const [isUploadingImageByVariant, setIsUploadingImageByVariant] = useState<
    Record<string, boolean>
  >({});
  const imageInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const {
    allUsers: subscribedUsers,
    testTargetUsers,
    hasCustomTestTargetUsers,
    isLoading: isLoadingUsers,
    error: usersLoadError,
  } = useAppTestTargetUsers(formData.appId, token);

  useEffect(() => {
    const allUserIds = new Set(subscribedUsers.map((user) => user.externalUserId));
    const testUserIds = new Set(testTargetUsers.map((user) => user.externalUserId));

    setFormData((prev) => {
      const nextTargetUserIds = prev.targetUserIds.filter((id) => allUserIds.has(id));
      const nextTestUserIds = prev.testUserIds.filter((id) => testUserIds.has(id));
      const targetChanged =
        nextTargetUserIds.length !== prev.targetUserIds.length ||
        nextTargetUserIds.some((id, index) => id !== prev.targetUserIds[index]);
      const testChanged =
        nextTestUserIds.length !== prev.testUserIds.length ||
        nextTestUserIds.some((id, index) => id !== prev.testUserIds[index]);

      if (!targetChanged && !testChanged) return prev;

      return {
        ...prev,
        targetUserIds: nextTargetUserIds,
        testUserIds: nextTestUserIds,
      };
    });
  }, [subscribedUsers, testTargetUsers]);

  const addVariant = () => {
    if (variants.length >= 5) return;
    const names = ["A", "B", "C", "D", "E"];
    const newWeight = Math.floor(100 / (variants.length + 1));
    const updatedVariants = variants.map((variant) => ({
      ...variant,
      weight: newWeight,
    }));
    updatedVariants.push({
      name: names[variants.length]!,
      weight: 100 - newWeight * variants.length,
      title: "",
      body: "",
    });
    setVariants(updatedVariants);
  };

  const removeVariant = (index: number) => {
    if (variants.length <= 2) return;
    const updated = variants.filter((_, variantIndex) => variantIndex !== index);
    const weightPerVariant = Math.floor(100 / updated.length);
    const remainder = 100 - weightPerVariant * updated.length;

    setVariants(
      updated.map((variant, variantIndex) => ({
        ...variant,
        weight: weightPerVariant + (variantIndex === 0 ? remainder : 0),
      })),
    );
    setPreviewVariant((current) => Math.min(current, updated.length - 1));
  };

  const updateVariant = (
    index: number,
    field: keyof ABTestVariant,
    value: string | number | undefined,
  ) => {
    setVariants((prev) =>
      prev.map((variant, variantIndex) =>
        variantIndex === index ? { ...variant, [field]: value } : variant,
      ),
    );
  };

  const handleUploadVariantImage = async (
    index: number,
    variantName: string,
    file: File,
  ) => {
    if (!token && !API_KEY) {
      setStatus({
        type: "error",
        message: tt("Missing auth token. Sign in again to upload images."),
      });
      return;
    }

    setIsUploadingImageByVariant((prev) => ({ ...prev, [variantName]: true }));
    setStatus(null);

    try {
      const body = new FormData();
      body.append("file", file);

      const headers = new Headers();
      if (token) headers.set("Authorization", `Bearer ${token}`);
      if (API_KEY) headers.set("X-API-Key", API_KEY);

      const response = await fetch(`${API_URL}/uploads`, {
        method: "POST",
        headers,
        body,
      });

      const json = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(json?.message || tt("Image upload failed"));
      }

      const url = json?.data?.url as string | undefined;
      if (!url) throw new Error(tt("Image upload did not return a URL"));

      updateVariant(index, "image", url);
    } catch (error: any) {
      setStatus({
        type: "error",
        message: error?.message || tt("Failed to upload image"),
      });
    } finally {
      setIsUploadingImageByVariant((prev) => ({ ...prev, [variantName]: false }));
    }
  };

  const handleSubmit = async () => {
    setStatus(null);

    if (!formData.appId || !formData.name.trim()) {
      setStatus({ type: "error", message: tt("App and test name are required.") });
      return;
    }

    const totalWeight = variants.reduce((sum, variant) => sum + variant.weight, 0);
    if (totalWeight !== 100) {
      setStatus({ type: "error", message: tt("Variant weights must sum to 100%.") });
      return;
    }

    if (variants.some((variant) => !variant.title.trim() || !variant.body.trim())) {
      setStatus({
        type: "error",
        message: tt("All variants must include title and body."),
      });
      return;
    }

    if (formData.testUserIds.length === 0) {
      setStatus({
        type: "error",
        message: tt("Test phase requires selecting at least one user."),
      });
      return;
    }

    if (
      formData.targetingMode === "USER_LIST" &&
      formData.targetUserIds.length === 0
    ) {
      setStatus({
        type: "error",
        message: tt("Select at least one live target user for Specific Users mode."),
      });
      return;
    }

    const payload = {
      appId: formData.appId,
      name: formData.name.trim(),
      description: formData.description.trim() || undefined,
      targetingMode: formData.targetingMode,
      targetUserIds:
        formData.targetingMode === "USER_LIST" ? formData.targetUserIds : undefined,
      variants: variants.map((variant) => ({
        name: variant.name,
        weight: variant.weight,
        title: variant.title.trim(),
        subtitle: variant.subtitle?.trim() || undefined,
        body: variant.body.trim(),
        image: variant.image || undefined,
      })),
    };

    setIsSaving(true);
    try {
      const test =
        mode === "create"
          ? await authApiCall<{ id: string }>("/ab-tests", {
              method: "POST",
              body: JSON.stringify(payload),
            })
          : await authApiCall<{ id: string }>(`/ab-tests/${initialTest!.id}`, {
              method: "PUT",
              body: JSON.stringify(payload),
            });

      await authApiCall(`/ab-tests/${test.id}/test`, {
        method: "POST",
        body: JSON.stringify({ userIds: formData.testUserIds }),
      });

      setStatus({
        type: "success",
        message:
          mode === "create"
            ? tt("A/B test created and test phase sent.")
            : tt("A/B test updated and second test phase sent."),
      });
      onSaved();
    } catch (error: any) {
      setStatus({
        type: "error",
        message: error?.message || tt("Failed to save A/B test."),
      });
    } finally {
      setIsSaving(false);
    }
  };

  const userSelectClass =
    "w-full min-h-40 border border-slate-200 rounded-xl p-3 text-sm bg-white";
  const getTargetUserOptionLabel = (user: (typeof subscribedUsers)[number]) =>
    `${getUserIdentityLabel(user)} (${user.devicesCount} devices)`;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-semibold">
            {mode === "create" ? tt("Create A/B Test") : tt("Edit A/B Test")}
          </h3>
          <p className="text-sm text-slate-500 mt-1">
            {tt(
              "Test phase sends all variants to selected users. Scheduling live is done from the A/B tests list.",
            )}
          </p>
        </div>
        <Button variant="outline" onClick={onBack}>
          {tt("Back to tests")}
        </Button>
      </div>

      {status && (
        <div
          className={clsx(
            "rounded-xl px-4 py-3 text-sm border",
            status.type === "error"
              ? "bg-rose-50 border-rose-200 text-rose-700"
              : "bg-emerald-50 border-emerald-200 text-emerald-700",
          )}
        >
          {status.message}
        </div>
      )}

      <div className="bg-white rounded-2xl border shadow-sm p-6 lg:p-8 grid grid-cols-1 xl:grid-cols-2 gap-8">
        <div className="space-y-5">
          <div>
            <label className="block text-sm font-semibold mb-2">{tt("App")} *</label>
            <select
              className="w-full h-12 px-4 border border-slate-200 rounded-xl text-sm bg-white"
              value={formData.appId}
              onChange={(event) =>
                setFormData((prev) => ({
                  ...prev,
                  appId: event.target.value,
                  targetUserIds: [],
                  testUserIds: [],
                }))
              }
              disabled={mode === "edit"}
            >
              <option value="" disabled>{tt("Select an app...")}</option>
              {apps.map((app) => (
                <option key={app.id} value={app.id}>
                  {app.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-semibold mb-2">
              {tt("Test Name")} *
            </label>
            <input
              className="w-full h-12 px-4 border border-slate-200 rounded-xl text-sm"
              placeholder={tt("e.g. New onboarding copy test")}
              value={formData.name}
              onChange={(event) =>
                setFormData((prev) => ({ ...prev, name: event.target.value }))
              }
            />
          </div>

          <div>
            <label className="block text-sm font-semibold mb-2">
              {tt("Description")}
            </label>
            <input
              className="w-full h-12 px-4 border border-slate-200 rounded-xl text-sm"
              placeholder={tt("Optional description")}
              value={formData.description}
              onChange={(event) =>
                setFormData((prev) => ({
                  ...prev,
                  description: event.target.value,
                }))
              }
            />
          </div>

          <div>
            <label className="block text-sm font-semibold mb-2">{tt("Targeting")}</label>
            <select
              className="w-full h-12 px-4 border border-slate-200 rounded-xl text-sm bg-white"
              value={formData.targetingMode}
              onChange={(event) =>
                setFormData((prev) => ({
                  ...prev,
                  targetingMode: event.target.value as "ALL" | "USER_LIST",
                  targetUserIds: [],
                }))
              }
            >
              <option value="ALL">{tt("All Users")}</option>
              <option value="USER_LIST">{tt("Specific Users")}</option>
            </select>
          </div>

          {formData.targetingMode === "USER_LIST" && (
            <div>
              <label className="block text-sm font-semibold mb-2">
                {tt("User IDs (one per line)")}
              </label>
              <select
                multiple
                className={userSelectClass}
                value={formData.targetUserIds}
                onChange={(event) =>
                  setFormData((prev) => ({
                    ...prev,
                    targetUserIds: Array.from(event.target.selectedOptions).map(
                      (option) => option.value,
                    ),
                  }))
                }
              >
                {subscribedUsers.length === 0 ? (
                  <option disabled value="">
                    {isLoadingUsers
                      ? tt("Loading users...")
                      : tt("No users with active devices")}
                  </option>
                ) : (
                  subscribedUsers.map((user) => (
                    <option key={user.externalUserId} value={user.externalUserId}>
                      {getTargetUserOptionLabel(user)}
                    </option>
                  ))
                )}
              </select>
              <p className="mt-2 text-xs text-slate-500">
                {tt("Select from existing users. Hold Cmd/Ctrl to select multiple.")}
              </p>
            </div>
          )}

          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-emerald-900 mb-2">
              <Users className="w-4 h-4" />
              {tt("Test phase recipients (required)")}
            </div>
            <p className="text-xs text-emerald-800 mb-3">
              {tt("All variants are sent to these users in test mode.")}
            </p>
            <select
              multiple
              className={userSelectClass}
              value={formData.testUserIds}
              onChange={(event) =>
                setFormData((prev) => ({
                  ...prev,
                  testUserIds: Array.from(event.target.selectedOptions).map(
                    (option) => option.value,
                  ),
                }))
              }
            >
              {testTargetUsers.length === 0 ? (
                <option disabled value="">
                  {isLoadingUsers
                    ? tt("Loading users...")
                    : hasCustomTestTargetUsers
                      ? tt("No preferred test users available for this app.")
                      : tt("No users with active devices")}
                </option>
              ) : (
                testTargetUsers.map((user) => (
                  <option key={user.externalUserId} value={user.externalUserId}>
                    {getTargetUserOptionLabel(user)}
                  </option>
                ))
              )}
            </select>
            {hasCustomTestTargetUsers && (
              <p className="mt-2 text-xs text-emerald-800">
                {tt(
                  "Showing only preferred test users configured in Users & Devices.",
                )}
              </p>
            )}
          </div>
          {usersLoadError && (
            <p className="text-xs text-rose-600">{usersLoadError}</p>
          )}

          <div className="border-t border-slate-100 pt-5 space-y-4">
            <div className="flex justify-between items-center">
              <label className="block text-sm font-semibold">{tt("Variants")} *</label>
              {variants.length < 5 && (
                <Button size="sm" variant="outline" onClick={addVariant}>
                  + {tt("Add Variant")}
                </Button>
              )}
            </div>
            <p className="text-xs text-slate-500 -mt-2">
              {tt("Weight determines how traffic is split between variants. Higher weight = more users see this variant. Weights are relative (e.g., 50/50 = equal split).")}
            </p>

            <div className="space-y-4">
              {variants.map((variant, index) => {
                const isUploading = Boolean(isUploadingImageByVariant[variant.name]);
                const selectPreview = () => setPreviewVariant(index);

                return (
                  <div
                    key={variant.name}
                    className={clsx(
                      "p-4 border rounded-xl",
                      previewVariant === index
                        ? "border-blue-300 bg-blue-50/60"
                        : "border-slate-200",
                    )}
                    onMouseDown={selectPreview}
                  >
                    <div className="flex justify-between items-center mb-3">
                      <span className="font-semibold text-sm">
                        {tt("Variant")} {variant.name}
                      </span>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min="1"
                          max="99"
                          className="w-16 h-9 px-2 border border-slate-200 rounded-lg text-sm text-center"
                          value={variant.weight}
                          onFocus={selectPreview}
                          onChange={(event) =>
                            updateVariant(
                              index,
                              "weight",
                              Number.parseInt(event.target.value, 10) || 0,
                            )
                          }
                        />
                        <span className="text-sm text-slate-500">%</span>
                        {variants.length > 2 && (
                          <button
                            type="button"
                            className="text-rose-500 hover:text-rose-700"
                            onClick={() => removeVariant(index)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <input
                        className="w-full h-11 px-3 border border-slate-200 rounded-lg text-sm"
                        placeholder={`${tt("Title")} *`}
                        value={variant.title}
                        onFocus={selectPreview}
                        onChange={(event) =>
                          updateVariant(index, "title", event.target.value)
                        }
                      />
                      <input
                        className="w-full h-11 px-3 border border-slate-200 rounded-lg text-sm"
                        placeholder={`${tt("Subtitle")} (${tt("optional")})`}
                        value={variant.subtitle || ""}
                        onFocus={selectPreview}
                        onChange={(event) =>
                          updateVariant(index, "subtitle", event.target.value)
                        }
                      />
                      <textarea
                        className="w-full p-3 border border-slate-200 rounded-lg text-sm"
                        placeholder={`${tt("Body")} *`}
                        rows={2}
                        value={variant.body}
                        onFocus={selectPreview}
                        onChange={(event) => updateVariant(index, "body", event.target.value)}
                      />

                      <div className="w-full border border-dashed border-slate-300 rounded-xl p-4 bg-slate-50">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            {variant.image ? (
                              <img
                                src={variant.image}
                                alt={`Variant ${variant.name} upload preview`}
                                className="w-14 h-14 rounded-lg object-cover border border-slate-200 bg-white"
                              />
                            ) : (
                              <div className="w-14 h-14 rounded-lg border border-slate-200 bg-white flex items-center justify-center">
                                <ImagePlus className="w-5 h-5 text-slate-500" />
                              </div>
                            )}
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-slate-700">
                                {variant.image
                                  ? tt("Image uploaded")
                                  : tt("Upload notification image")}
                              </p>
                              <p className="text-xs text-slate-500">
                                {variant.image
                                  ? tt("Ready to send with this variant")
                                  : tt("PNG/JPG up to 5MB")}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={() => imageInputRefs.current[variant.name]?.click()}
                              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-indigo-700 border border-indigo-200 rounded-lg bg-white hover:bg-indigo-50"
                              disabled={isUploading}
                            >
                              {isUploading ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Upload className="w-3.5 h-3.5" />
                              )}
                              {isUploading
                                ? tt("Uploading...")
                                : variant.image
                                  ? tt("Replace")
                                  : tt("Choose")}
                            </button>
                            {variant.image && (
                              <button
                                type="button"
                                onClick={() => updateVariant(index, "image", undefined)}
                                className="px-3 py-1.5 text-xs font-semibold text-rose-700 border border-rose-200 rounded-lg bg-white hover:bg-rose-50"
                              >
                                {tt("Delete")}
                              </button>
                            )}
                          </div>
                        </div>

                        <input
                          ref={(node) => {
                            imageInputRefs.current[variant.name] = node;
                          }}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            if (file) {
                              void handleUploadVariantImage(index, variant.name, file);
                            }
                            event.currentTarget.value = "";
                          }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="pt-2 flex justify-end gap-3">
            <Button variant="outline" onClick={onBack}>
              {tt("Cancel")}
            </Button>
            <Button onClick={handleSubmit} disabled={isSaving}>
              {isSaving
                ? tt("Saving...")
                : mode === "create"
                  ? tt("Create & Send Test")
                  : tt("Save & Send Test")}
            </Button>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 p-6 bg-slate-50 self-start xl:sticky xl:top-6">
          <div className="mb-4">
            <div className="text-xs uppercase tracking-wider text-slate-500 font-semibold">
              {tt("Test environment")}
            </div>
            <h4 className="text-xl font-semibold text-slate-900">
              {tt("Live Preview")}
            </h4>
            <p className="text-sm text-slate-500 mt-1">
              {tt("Preview Variant")} {variants[previewVariant]?.name}
            </p>
          </div>
          <NotificationPreview
            platform="android"
            title={variants[previewVariant]?.title || tt("Title")}
            subtitle={variants[previewVariant]?.subtitle}
            body={variants[previewVariant]?.body || tt("Body")}
            image={variants[previewVariant]?.image}
          />
        </div>
      </div>
    </div>
  );
}
