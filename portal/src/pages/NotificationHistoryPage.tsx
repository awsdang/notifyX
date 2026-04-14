import { useEffect, useMemo, useState } from "react";
import { CalendarRange, Filter, Megaphone, Pause, Play } from "lucide-react";
import type { Application, NotificationHistoryItem } from "../types";
import { apiFetch, apiFetchEnvelope } from "../lib/api";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/Card";
import { Input, Select } from "../components/ui/Input";
import { Badge, StatusBadge } from "../components/ui/Badge";
import { EmptyState } from "../components/ui/EmptyState";
import { SkeletonTable } from "../components/ui/Skeleton";
import { useScopedTranslation } from "../context/I18nContext";
import { useConfirmDialog } from "../context/ConfirmDialogContext";
import {
  compareUsersByIdentity,
  getUserIdentityLabel,
} from "../lib/userIdentity";

interface NotificationHistoryPageProps {
  apps: Application[];
  token: string | null;
}

interface HistoryFilters {
  appId: string;
  from: string;
  to: string;
  userId: string;
  deviceId: string;
}

interface HistoryUserOption {
  id: string;
  externalUserId: string;
  nickname?: string | null;
  devicesCount: number;
}

interface HistoryDeviceOption {
  id: string;
  platform: string;
  provider: string;
}

interface UsersResponse {
  users: Array<{
    id: string;
    externalUserId: string;
    nickname?: string | null;
    _count?: { devices?: number };
  }>;
  pagination?: {
    totalPages?: number;
  };
}

interface DevicesResponse {
  devices: Array<{
    id: string;
    platform: string;
    provider: string;
    isActive: boolean;
  }>;
  pagination?: {
    totalPages?: number;
  };
}

const PAGE_SIZE = 20;
const DEFAULT_FILTERS: HistoryFilters = {
  appId: "all",
  from: "",
  to: "",
  userId: "",
  deviceId: "",
};

function formatDateTime(value?: string | null): string {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString(undefined, { timeZoneName: "short" });
}

function getNotificationTitle(
  item: NotificationHistoryItem,
  tp: (key: string, fallback?: string) => string,
): string {
  const title = item.payload?.adhocContent?.title?.trim();
  if (title) return title;
  return item.type === "campaign"
    ? tp("campaignNotification", "Campaign Notification")
    : tp("transactionalNotification", "Transactional Notification");
}

function truncateText(value: string, max = 160): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max)}...`;
}

export function NotificationHistoryPage({
  apps,
  token,
}: NotificationHistoryPageProps) {
  const tp = useScopedTranslation("pages", "NotificationHistoryPage");
  const { confirm } = useConfirmDialog();

  const appNameById = useMemo(
    () => new Map(apps.map((app) => [app.id, app.name])),
    [apps],
  );

  const sortedApps = useMemo(
    () => [...apps].sort((a, b) => a.name.localeCompare(b.name)),
    [apps],
  );

  const [draftFilters, setDraftFilters] = useState<HistoryFilters>(DEFAULT_FILTERS);
  const [filters, setFilters] = useState<HistoryFilters>(DEFAULT_FILTERS);
  const [page, setPage] = useState(1);

  const [notifications, setNotifications] = useState<NotificationHistoryItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [activeActionId, setActiveActionId] = useState<string | null>(null);
  const [activeActionType, setActiveActionType] = useState<"stop" | "resume" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [users, setUsers] = useState<HistoryUserOption[]>([]);
  const [devices, setDevices] = useState<HistoryDeviceOption[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [isLoadingDevices, setIsLoadingDevices] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const selectedDraftUser = useMemo(
    () => users.find((user) => user.externalUserId === draftFilters.userId) || null,
    [users, draftFilters.userId],
  );
  const userLabelByExternalId = useMemo(
    () =>
      new Map(users.map((user) => [user.externalUserId, getUserIdentityLabel(user)])),
    [users],
  );

  useEffect(() => {
    if (!token || draftFilters.appId === "all") {
      setUsers([]);
      setDevices([]);
      setDraftFilters((prev) =>
        prev.userId || prev.deviceId ? { ...prev, userId: "", deviceId: "" } : prev,
      );
      return;
    }

    let isMounted = true;
    setIsLoadingUsers(true);

    const loadUsers = async () => {
      try {
        const collected = new Map<string, HistoryUserOption>();
        let pageNumber = 1;
        let totalPages = 1;

        do {
          const result = await apiFetch<UsersResponse>(
            `/users?appId=${encodeURIComponent(draftFilters.appId)}&page=${pageNumber}&limit=100`,
            {},
            token,
          );

          for (const user of result.users || []) {
            collected.set(user.externalUserId, {
              id: user.id,
              externalUserId: user.externalUserId,
              nickname: user.nickname ?? null,
              devicesCount: user._count?.devices || 0,
            });
          }

          totalPages = result.pagination?.totalPages || 1;
          pageNumber += 1;
        } while (pageNumber <= totalPages);

        if (!isMounted) return;

        const list = Array.from(collected.values()).sort(compareUsersByIdentity);

        setUsers(list);
        setDraftFilters((prev) => {
          if (!prev.userId) return prev;
          const exists = list.some((item) => item.externalUserId === prev.userId);
          return exists ? prev : { ...prev, userId: "", deviceId: "" };
        });
      } finally {
        if (isMounted) setIsLoadingUsers(false);
      }
    };

    void loadUsers();

    return () => {
      isMounted = false;
    };
  }, [draftFilters.appId, token]);

  useEffect(() => {
    if (!token || draftFilters.appId === "all" || !selectedDraftUser) {
      setDevices([]);
      setDraftFilters((prev) => (prev.deviceId ? { ...prev, deviceId: "" } : prev));
      return;
    }

    let isMounted = true;
    setIsLoadingDevices(true);

    const loadDevices = async () => {
      try {
        const collected = new Map<string, HistoryDeviceOption>();
        let pageNumber = 1;
        let totalPages = 1;

        do {
          const result = await apiFetch<DevicesResponse>(
            `/devices?appId=${encodeURIComponent(draftFilters.appId)}&userId=${encodeURIComponent(selectedDraftUser.id)}&isActive=true&page=${pageNumber}&limit=100`,
            {},
            token,
          );

          for (const device of result.devices || []) {
            if (!device.isActive) continue;
            collected.set(device.id, {
              id: device.id,
              platform: device.platform,
              provider: device.provider,
            });
          }

          totalPages = result.pagination?.totalPages || 1;
          pageNumber += 1;
        } while (pageNumber <= totalPages);

        if (!isMounted) return;

        const list = Array.from(collected.values()).sort((a, b) =>
          a.id.localeCompare(b.id),
        );

        setDevices(list);
        setDraftFilters((prev) => {
          if (!prev.deviceId) return prev;
          const exists = list.some((item) => item.id === prev.deviceId);
          return exists ? prev : { ...prev, deviceId: "" };
        });
      } finally {
        if (isMounted) setIsLoadingDevices(false);
      }
    };

    void loadDevices();

    return () => {
      isMounted = false;
    };
  }, [draftFilters.appId, selectedDraftUser, token]);

  useEffect(() => {
    if (!token) {
      setNotifications([]);
      setTotalCount(0);
      return;
    }

    let isMounted = true;
    setIsLoading(true);
    setError(null);

    const query = new URLSearchParams({
      page: String(page),
      limit: String(PAGE_SIZE),
      cacheBust: String(Date.now()),
    });

    if (filters.appId !== "all") query.set("appId", filters.appId);
    if (filters.from) query.set("from", filters.from);
    if (filters.to) query.set("to", filters.to);
    if (filters.userId) query.set("userId", filters.userId);
    if (filters.deviceId) query.set("deviceId", filters.deviceId);

    const loadNotifications = async () => {
      try {
        const response = await apiFetchEnvelope<NotificationHistoryItem[]>(
          `/notifications?${query.toString()}`,
          {},
          token,
        );

        if (!isMounted) return;

        setNotifications(Array.isArray(response.data) ? response.data : []);
        setTotalCount(response.totalCount || 0);
      } catch (err) {
        if (!isMounted) return;
        const message =
          err instanceof Error
            ? err.message
            : tp("failedLoadNotifications", "Failed to load notifications");
        setError(message);
        setNotifications([]);
        setTotalCount(0);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    void loadNotifications();

    return () => {
      isMounted = false;
    };
  }, [filters, page, reloadKey, token]);

  const canStop = (status: string) =>
    ["SCHEDULED", "QUEUED"].includes(status.toUpperCase());

  const canResume = (status: string) =>
    ["CANCELLED"].includes(status.toUpperCase());

  const refreshHistory = () => {
    setReloadKey((prev) => prev + 1);
  };

  const stopNotification = async (item: NotificationHistoryItem) => {
    if (!token) return;

    const approved = await confirm({
      title: tp("stopNotificationTitle", "Stop notification?"),
      description: tp(
        "stopNotificationDescription",
        "This will cancel this notification and prevent further sends.",
      ),
      confirmText: tp("stop", "Stop"),
      destructive: true,
    });
    if (!approved) return;

    setActiveActionId(item.id);
    setActiveActionType("stop");
    setError(null);
    try {
      await apiFetch(`/notifications/${item.id}/cancel`, { method: "POST" }, token);
      refreshHistory();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : tp("failedStopNotification", "Failed to stop notification"),
      );
    } finally {
      setActiveActionId(null);
      setActiveActionType(null);
    }
  };

  const resumeNotification = async (item: NotificationHistoryItem) => {
    if (!token) return;

    const approved = await confirm({
      title: tp("resumeNotificationTitle", "Resume notification?"),
      description: tp(
        "resumeNotificationDescription",
        "This will queue the notification for immediate delivery.",
      ),
      confirmText: tp("resume", "Resume"),
    });
    if (!approved) return;

    setActiveActionId(item.id);
    setActiveActionType("resume");
    setError(null);
    try {
      await apiFetch(
        `/notifications/${item.id}/force-send`,
        { method: "POST" },
        token,
      );
      refreshHistory();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : tp("failedResumeNotification", "Failed to resume notification"),
      );
    } finally {
      setActiveActionId(null);
      setActiveActionType(null);
    }
  };

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const hasActiveFilters =
    filters.appId !== "all" ||
    filters.from ||
    filters.to ||
    filters.userId ||
    filters.deviceId;

  const applyFilters = () => {
    const normalized: HistoryFilters = {
      appId: draftFilters.appId,
      from: draftFilters.from,
      to: draftFilters.to,
      userId: draftFilters.userId,
      deviceId: draftFilters.deviceId,
    };

    setFilters(normalized);
    setPage(1);
  };

  const clearFilters = () => {
    setDraftFilters(DEFAULT_FILTERS);
    setFilters(DEFAULT_FILTERS);
    setPage(1);
  };

  return (
    <section className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-4">
      {/* ── Filter Panel ── */}
      <Card padding="md">
        <div className="mb-3 flex items-center gap-2 text-slate-800">
          <Filter className="h-4 w-4" />
          <h3 className="text-xs font-bold uppercase tracking-wider">
            {tp("filters", "Filters")}
          </h3>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-6">
          <Select
            label={tp("app", "App")}
            value={draftFilters.appId}
            onChange={(event) =>
              setDraftFilters((prev) => ({
                ...prev,
                appId: event.target.value,
                userId: "",
                deviceId: "",
              }))
            }
          >
            <option value="all">{tp("allApps", "All Apps")}</option>
            {sortedApps.map((app) => (
              <option key={app.id} value={app.id}>
                {app.name}
              </option>
            ))}
          </Select>

          <Input
            label={tp("from", "From")}
            type="date"
            value={draftFilters.from}
            onChange={(event) =>
              setDraftFilters((prev) => ({ ...prev, from: event.target.value }))
            }
          />

          <Input
            label={tp("to", "To")}
            type="date"
            value={draftFilters.to}
            onChange={(event) =>
              setDraftFilters((prev) => ({ ...prev, to: event.target.value }))
            }
          />

          <Select
            label={tp("user", "User")}
            value={draftFilters.userId}
            onChange={(event) =>
              setDraftFilters((prev) => ({
                ...prev,
                userId: event.target.value,
                deviceId: "",
              }))
            }
            disabled={draftFilters.appId === "all" || isLoadingUsers}
          >
            <option value="">{tp("allUsers", "All users")}</option>
            {users.map((user) => (
              <option key={user.id} value={user.externalUserId}>
                {getUserIdentityLabel(user)} ({user.devicesCount})
              </option>
            ))}
          </Select>

          <Select
            label={tp("activeDevice", "Active Device")}
            value={draftFilters.deviceId}
            onChange={(event) =>
              setDraftFilters((prev) => ({ ...prev, deviceId: event.target.value }))
            }
            disabled={!selectedDraftUser || isLoadingDevices}
          >
            <option value="">{tp("allDevices", "All devices")}</option>
            {devices.map((device) => (
              <option key={device.id} value={device.id}>
                {device.platform}/{device.provider} - {device.id.slice(0, 8)}
              </option>
            ))}
          </Select>

          <div className="flex items-end gap-2">
            <Button variant="outline" className="w-full" onClick={clearFilters}>
              {tp("clear", "Clear")}
            </Button>
            <Button className="w-full" onClick={applyFilters}>
              {tp("apply", "Apply")}
            </Button>
          </div>
        </div>

        <div className="mt-3 inline-flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
          <CalendarRange className="h-4 w-4" />
          <span>
            {tp(
              "showingCounts",
              "Showing {{shown}} of {{total}} notifications",
              {
                shown: notifications.length.toLocaleString(),
                total: totalCount.toLocaleString(),
              },
            )}
          </span>
        </div>
      </Card>

      {/* ── Results ── */}
      <div className="space-y-2">
        {isLoading && notifications.length === 0 ? (
          <SkeletonTable rows={8} />
        ) : null}

        {!isLoading && error ? (
          <Card padding="sm" className="border-rose-200 bg-rose-50">
            <p className="text-sm text-rose-700">{error}</p>
          </Card>
        ) : null}

        {!isLoading && !error && notifications.length === 0 ? (
          <EmptyState
            icon={<Megaphone className="h-6 w-6" />}
            title={tp(
              "noNotificationsFound",
              "No notifications found for the selected filters.",
            )}
            description={tp(
              "noNotificationsHint",
              "Try clearing your filters or expanding the date range to see more results.",
            )}
            action={
              hasActiveFilters
                ? {
                    label: tp("clearFilters", "Clear all filters"),
                    onClick: clearFilters,
                  }
                : undefined
            }
          />
        ) : null}

        {notifications.map((item) => {
          const content = item.payload?.adhocContent;
          const userIds = item.payload?.userIds || [];
          const platforms = item.payload?.platforms || [];
          const actions = Array.isArray(content?.actions) ? content.actions : [];
          const appName = item.app?.name || appNameById.get(item.appId) || item.appId;
          const summary = item.deliverySummary;
          const workerProcessed = (summary?.totalDeliveries || 0) > 0;

          return (
            <Card key={item.id} padding="md">
              <header className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                  <h4 className="truncate text-base font-bold text-slate-900">
                    {getNotificationTitle(item, tp)}
                  </h4>
                  <p
                    className="truncate font-mono text-[11px] text-slate-500 cursor-pointer select-all"
                    title={item.id}
                    onClick={() => void navigator.clipboard.writeText(item.id)}
                  >
                    {item.id}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant="default">
                    {item.type
                      .replace(/_/g, " ")
                      .replace(/\b\w/g, (c) => c.toUpperCase())}
                  </Badge>
                  <StatusBadge status={item.status} />
                  <Badge variant="warning">{item.priority}</Badge>
                  {canStop(item.status) ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 gap-1 border-red-200 text-red-700 hover:bg-red-50"
                      disabled={activeActionId === item.id}
                      onClick={() => void stopNotification(item)}
                    >
                      <Pause className="h-3.5 w-3.5" />
                      {activeActionId === item.id && activeActionType === "stop"
                        ? tp("stopping", "Stopping...")
                        : tp("stop", "Stop")}
                    </Button>
                  ) : null}
                  {canResume(item.status) ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 gap-1 border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                      disabled={activeActionId === item.id}
                      onClick={() => void resumeNotification(item)}
                    >
                      <Play className="h-3.5 w-3.5" />
                      {activeActionId === item.id && activeActionType === "resume"
                        ? tp("resuming", "Resuming...")
                        : tp("resume", "Resume")}
                    </Button>
                  ) : null}
                </div>
              </header>

              <p className="mt-2 text-sm text-slate-700">
                {truncateText(content?.body || "-")}
              </p>

              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
                <span>
                  <strong>{tp("appLabel", "App")}:</strong> {appName}
                </span>
                <span>
                  <strong>{tp("scheduledLabel", "Scheduled")}:</strong>{" "}
                  {formatDateTime(item.sendAt)}
                </span>
                <span>
                  <strong>{tp("createdLabel", "Created")}:</strong>{" "}
                  {formatDateTime(item.createdAt)}
                </span>
                <span>
                  <strong>{tp("deliveriesLabel", "Deliveries")}:</strong>{" "}
                  {summary?.totalDeliveries ?? item._count?.deliveries ?? 0}
                </span>
                <span>
                  <strong>{tp("createdByLabel", "Created By")}:</strong>{" "}
                  {item.createdBy || "-"}
                </span>
              </div>

              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                <Badge variant={workerProcessed ? "success" : "default"}>
                  {workerProcessed
                    ? tp(
                        "workerDelivered",
                        "Worker: delivered {{delivered}}/{{total}}",
                        {
                          delivered: summary?.delivered || 0,
                          total: summary?.totalDeliveries || 0,
                        },
                      )
                    : tp(
                        "workerNoRecords",
                        "Worker: no delivery records yet",
                      )}
                </Badge>
                <Badge variant="default">
                  {tp("lastSentLabel", "Last Sent")}:{" "}
                  {formatDateTime(summary?.lastSentAt)}
                </Badge>
                <Badge variant="default">
                  {tp("providersLabel", "Providers")}:{" "}
                  {summary?.providers?.join(", ") || "-"}
                </Badge>
              </div>

              <details className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                <summary className="cursor-pointer text-sm font-semibold text-slate-700">
                  {tp("details", "Details")}
                </summary>
                <div className="mt-3 grid grid-cols-1 gap-3 text-xs text-slate-700 md:grid-cols-2">
                  <div>
                    <p className="font-semibold text-slate-500">
                      {tp("title", "Title")}
                    </p>
                    <p>{content?.title || "-"}</p>
                  </div>
                  <div>
                    <p className="font-semibold text-slate-500">
                      {tp("description", "Description")}
                    </p>
                    <p>{content?.subtitle || "-"}</p>
                  </div>
                  <div>
                    <p className="font-semibold text-slate-500">
                      {tp("primaryCtaUrl", "Primary CTA URL")}
                    </p>
                    <p>{content?.actionUrl || "-"}</p>
                  </div>
                  <div>
                    <p className="font-semibold text-slate-500">
                      {tp("ctaActions", "CTA Actions")}
                    </p>
                    <p>{actions.length}</p>
                  </div>
                  <div>
                    <p className="font-semibold text-slate-500">
                      {tp("image", "Image")}
                    </p>
                    <p className="break-all">{content?.image || "-"}</p>
                  </div>
                  <div>
                    <p className="font-semibold text-slate-500">
                      {tp("templateId", "Template ID")}
                    </p>
                    <p className="font-mono">{item.templateId || "-"}</p>
                  </div>
                  <div>
                    <p className="font-semibold text-slate-500">
                      {tp("campaignId", "Campaign ID")}
                    </p>
                    <p className="font-mono">{item.campaignId || "-"}</p>
                  </div>
                  <div>
                    <p className="font-semibold text-slate-500">
                      {tp("updatedAt", "Updated At")}
                    </p>
                    <p>{formatDateTime(item.updatedAt)}</p>
                  </div>
                  <div className="md:col-span-2">
                    <p className="font-semibold text-slate-500">
                      {tp("targetUserIds", "Target User IDs")}
                    </p>
                    <p>
                      {userIds.length > 0
                        ? userIds
                            .map((userId) => userLabelByExternalId.get(userId) || userId)
                            .join(", ")
                        : tp(
                            "targetUserIdsFallback",
                            "All users / not explicitly targeted",
                          )}
                    </p>
                  </div>
                  <div>
                    <p className="font-semibold text-slate-500">
                      {tp("platforms", "Platforms")}
                    </p>
                    <p>{platforms.length > 0 ? platforms.join(", ") : tp("all", "All")}</p>
                  </div>
                  <div>
                    <p className="font-semibold text-slate-500">
                      {tp("deliveryStatuses", "Delivery Statuses")}
                    </p>
                    <p>
                      {summary?.delivered || 0} delivered, {summary?.failed || 0} failed, {summary?.retry || 0} retrying, {summary?.pending || 0} pending
                    </p>
                  </div>
                  <div className="md:col-span-2">
                    <p className="font-semibold text-slate-500">
                      {tp("variables", "Variables")}
                    </p>
                    <pre className="max-h-24 overflow-auto rounded-lg bg-white p-2 text-[11px]">
                      {JSON.stringify(item.payload?.variables || {}, null, 2)}
                    </pre>
                  </div>
                  <div className="md:col-span-2">
                    <p className="font-semibold text-slate-500">
                      {tp("ctaActionsPayload", "CTA Actions Payload")}
                    </p>
                    <pre className="max-h-24 overflow-auto rounded-lg bg-white p-2 text-[11px]">
                      {JSON.stringify(actions, null, 2)}
                    </pre>
                  </div>
                  <div className="md:col-span-2">
                    <p className="font-semibold text-slate-500">
                      {tp("customData", "Custom Data")}
                    </p>
                    <pre className="max-h-24 overflow-auto rounded-lg bg-white p-2 text-[11px]">
                      {JSON.stringify(content?.data || {}, null, 2)}
                    </pre>
                  </div>
                </div>
              </details>
            </Card>
          );
        })}
      </div>

      {/* ── Pagination ── */}
      <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3">
        <p className="text-sm text-slate-600">
          {tp("pageOf", "Page {{page}} of {{totalPages}}", {
            page,
            totalPages,
          })}
        </p>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => setPage((prev) => Math.max(1, prev - 1))}
            disabled={isLoading || page <= 1}
          >
            {tp("previous", "Previous")}
          </Button>
          <Button
            variant="outline"
            onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
            disabled={isLoading || page >= totalPages}
          >
            {tp("next", "Next")}
          </Button>
        </div>
      </div>
    </section>
  );
}
