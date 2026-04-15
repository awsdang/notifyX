import { useEffect, useMemo, useState } from "react";
import { Button } from "./ui/button";
import { Card } from "./ui/Card";
import { Badge } from "./ui/Badge";
import { EmptyState } from "./ui/EmptyState";
import { SkeletonTable } from "./ui/Skeleton";
import { Input, Select } from "./ui/Input";
import {
  Users,
  Smartphone,
  Search,
  ChevronLeft,
  ChevronRight,
  Trash2,
  XCircle,
  RefreshCw,
  UploadCloud,
  Bot,
  Globe,
  X,
} from "lucide-react";
import { clsx } from "clsx";
import { AudienceManager } from "./AudienceManager";
import { useConfirmDialog } from "../context/ConfirmDialogContext";
import { useI18n, useScopedTranslation } from "../context/I18nContext";
import {
  getPreferredUserName,
  normalizeNickname,
} from "../lib/userIdentity";
import { useAppTestTargetUsers } from "../hooks/useAppTestTargetUsers";
import { apiFetch } from "../lib/api";
const MAX_VISIBLE_TEST_TARGET_USERS = 300;

interface User {
  id: string;
  externalUserId: string;
  nickname?: string | null;
  appId: string;
  language: string;
  timezone: string;
  createdAt: string;
  app: { id: string; name: string };
  _count: { devices: number };
  devices?: Device[];
}

interface Device {
  id: string;
  userId: string;
  platform: string;
  pushToken: string;
  provider: string;
  isActive: boolean;
  lastSeenAt: string;
  createdAt: string;
  user?: {
    id: string;
    externalUserId: string;
    nickname?: string | null;
    app: { id: string; name: string };
  };
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface UsersDevicesProps {
  apps: any[];
  token: string | null;
}

export function UsersDevices({ apps, token }: UsersDevicesProps) {
  const tu = useScopedTranslation("components", "UsersDevices");
  const { direction, language } = useI18n();
  const tt = (
    key: string,
    params?: Record<string, string | number>,
    fallback?: string,
  ) => tu(key, fallback || key, params);
  const { confirm } = useConfirmDialog();
  const [activeTab, setActiveTab] = useState<"users" | "devices" | "import">(
    "users",
  );
  const [users, setUsers] = useState<User[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [usersPagination, setUsersPagination] = useState<Pagination | null>(
    null,
  );
  const [devicesPagination, setDevicesPagination] = useState<Pagination | null>(
    null,
  );
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nicknameDraft, setNicknameDraft] = useState("");
  const [isSavingNickname, setIsSavingNickname] = useState(false);
  const [nicknameStatus, setNicknameStatus] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [filterAppId, setFilterAppId] = useState(() => apps[0]?.id || "");
  const [filterPlatform, setFilterPlatform] = useState("");
  const [filterProvider, setFilterProvider] = useState("");
  const [filterActive, setFilterActive] = useState("");
  const [testTargetSearch, setTestTargetSearch] = useState("");
  const {
    allUsers: testTargetCandidates,
    preferredTestTargetIds,
    hasCustomTestTargetUsers,
    isLoading: isLoadingTestTargetUsers,
    error: testTargetUsersError,
    setPreferredTestTargetIds,
    clearPreferredTestTargetIds,
  } = useAppTestTargetUsers(filterAppId, token);

  const authApiCall = async <T = any,>(
    endpoint: string,
    options: RequestInit = {},
  ): Promise<T> => {
    return apiFetch<T>(endpoint, options, token);
  };

  const fetchUsers = async (page = 1) => {
    if (!filterAppId) {
      setUsers([]);
      setUsersPagination(null);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "10" });
      if (searchQuery) params.append("search", searchQuery);
      params.append("appId", filterAppId);

      params.append("ts", Date.now().toString());
      const data = await authApiCall(`/users?${params}`);
      setUsers(data.users);
      setUsersPagination(data.pagination);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchDevices = async (page = 1) => {
    if (!filterAppId) {
      setDevices([]);
      setDevicesPagination(null);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "10" });
      params.append("appId", filterAppId);
      if (filterPlatform) params.append("platform", filterPlatform);
      if (filterProvider) params.append("provider", filterProvider);
      if (filterActive) params.append("isActive", filterActive);
      if (selectedUser) params.append("userId", selectedUser.id);
      params.append("ts", Date.now().toString());

      const data = await authApiCall(`/devices?${params}`);
      setDevices(data.devices);
      setDevicesPagination(data.pagination);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchUserDetails = async (userId: string) => {
    setIsLoading(true);
    try {
      const user = await authApiCall(`/users/${userId}?ts=${Date.now()}`);
      setSelectedUser(user);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const deactivateDevice = async (deviceId: string) => {
    const confirmed = await confirm({
      title: tt("Deactivate Device"),
      description: tt("Are you sure you want to deactivate this device?"),
      confirmText: tt("Deactivate"),
      destructive: true,
    });
    if (!confirmed) return;
    try {
      setError(null);
      await authApiCall(`/devices/${deviceId}/deactivate`, { method: "PATCH" });

      setDevices((prev) =>
        prev.map((device) =>
          device.id === deviceId ? { ...device, isActive: false } : device,
        ),
      );
      setSelectedUser((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          devices: (prev.devices || []).map((device) =>
            device.id === deviceId ? { ...device, isActive: false } : device,
          ),
        };
      });
      setUsers((prev) =>
        prev.map((user) => {
          if (user.id !== selectedUser?.id) return user;
          const nextCount = Math.max(0, (user._count?.devices || 0) - 1);
          return { ...user, _count: { ...user._count, devices: nextCount } };
        }),
      );

      // Refresh devices
      if (selectedUser) {
        await fetchUserDetails(selectedUser.id);
      } else {
        await fetchDevices(devicesPagination?.page || 1);
      }
    } catch (err: any) {
      const message = err?.message || tt("Failed to deactivate device.");
      setError(message);
      console.error(`Error: ${message}`);
    }
  };

  const activateDevice = async (deviceId: string) => {
    const confirmed = await confirm({
      title: tt("Activate Device"),
      description: tt("Activate this device again for notifications?"),
      confirmText: tt("Activate"),
    });
    if (!confirmed) return;

    try {
      setError(null);
      await authApiCall(`/devices/${deviceId}/activate`, { method: "PATCH" });

      setDevices((prev) =>
        prev.map((device) =>
          device.id === deviceId ? { ...device, isActive: true } : device,
        ),
      );
      setSelectedUser((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          devices: (prev.devices || []).map((device) =>
            device.id === deviceId ? { ...device, isActive: true } : device,
          ),
        };
      });
      setUsers((prev) =>
        prev.map((user) => {
          if (user.id !== selectedUser?.id) return user;
          return {
            ...user,
            _count: { ...user._count, devices: (user._count?.devices || 0) + 1 },
          };
        }),
      );

      if (selectedUser) {
        await fetchUserDetails(selectedUser.id);
      } else {
        await fetchDevices(devicesPagination?.page || 1);
      }
    } catch (err: any) {
      const message = err?.message || tt("Failed to activate device.");
      setError(message);
      console.error(`Error: ${message}`);
    }
  };

  const deleteUser = async (userId: string) => {
    const confirmed = await confirm({
      title: tt("Delete User"),
      description: tt(
        "Are you sure you want to delete this user? All their devices will be deactivated.",
      ),
      confirmText: tt("Delete User"),
      destructive: true,
    });
    if (!confirmed) return;
    try {
      const targetUser =
        selectedUser?.id === userId
          ? selectedUser
          : users.find((user) => user.id === userId) || null;
      await authApiCall(`/users/${userId}`, { method: "DELETE" });
      if (
        targetUser?.externalUserId &&
        preferredTestTargetSet.has(targetUser.externalUserId)
      ) {
        setPreferredTestTargetIds(
          preferredTestTargetIds.filter(
            (id) => id !== targetUser.externalUserId,
          ),
        );
      }
      setSelectedUser(null);
      fetchUsers(usersPagination?.page || 1);
    } catch (err: any) {
      console.error(`Error: ${err.message}`);
    }
  };

  const updateSelectedUserNickname = async () => {
    if (!selectedUser) return;

    const nickname = normalizeNickname(nicknameDraft);
    setIsSavingNickname(true);
    setNicknameStatus(null);
    setError(null);

    try {
      const updatedUser = await authApiCall<{ id: string; nickname?: string | null }>(
        `/users/${selectedUser.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({ nickname }),
        },
      );

      setSelectedUser((prev) =>
        prev
          ? {
              ...prev,
              nickname: updatedUser.nickname ?? null,
            }
          : prev,
      );
      setNicknameDraft(updatedUser.nickname || "");
      setNicknameStatus({
        type: "success",
        message: tt("Nickname saved"),
      });
      setUsers((prev) =>
        prev.map((user) =>
          user.id === updatedUser.id
            ? { ...user, nickname: updatedUser.nickname ?? null }
            : user,
        ),
      );
      setDevices((prev) =>
        prev.map((device) =>
          device.user?.id === updatedUser.id
            ? {
                ...device,
                user: {
                  ...device.user,
                  nickname: updatedUser.nickname ?? null,
                },
              }
            : device,
        ),
      );
    } catch (err: any) {
      const message = err?.message || tt("Failed to save nickname.");
      setNicknameStatus({ type: "error", message });
    } finally {
      setIsSavingNickname(false);
    }
  };

  useEffect(() => {
    if (apps.length === 0) {
      if (filterAppId !== "") {
        setFilterAppId("");
      }
      return;
    }

    if (!apps.some((app) => app.id === filterAppId)) {
      setFilterAppId(apps[0]!.id);
    }
  }, [apps, filterAppId]);

  useEffect(() => {
    setSelectedUser(null);
    setTestTargetSearch("");
  }, [filterAppId]);

  useEffect(() => {
    if (activeTab === "users" && !selectedUser) {
      fetchUsers();
    } else if (activeTab === "devices") {
      fetchDevices();
    }
  }, [activeTab, filterAppId, filterPlatform, filterProvider, filterActive]);

  useEffect(() => {
    if (searchQuery === "" && activeTab === "users") {
      fetchUsers();
    }
  }, [searchQuery]);

  useEffect(() => {
    if (!selectedUser) {
      setNicknameDraft("");
      setNicknameStatus(null);
      return;
    }
    setNicknameDraft(selectedUser.nickname || "");
    setNicknameStatus(null);
  }, [selectedUser]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (activeTab === "users") {
      fetchUsers();
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString(
      language === "ar" ? "ar" : "en-US",
      {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      },
    );
  };

  const PrevIcon = direction === "rtl" ? ChevronRight : ChevronLeft;
  const NextIcon = direction === "rtl" ? ChevronLeft : ChevronRight;

  const getPlatformLabel = (platform: string) => {
    const normalized = platform.toLowerCase();
    if (normalized === "android") return tt("Android", undefined, "Android");
    if (normalized === "ios") return tt("iOS", undefined, "iOS");
    if (normalized === "web") return tt("Web", undefined, "Web");
    if (normalized === "huawei") return tt("Huawei", undefined, "Huawei");
    return platform;
  };

  const getProviderLabel = (provider: string) => {
    const normalized = provider.toLowerCase();
    if (normalized === "fcm") return tt("FCM", undefined, "FCM");
    if (normalized === "apns") return tt("APNS", undefined, "APNS");
    if (normalized === "hms") return tt("HMS", undefined, "HMS");
    if (normalized === "web") return tt("Web Push", undefined, "Web Push");
    return provider.toUpperCase();
  };

  const getStatusLabel = (isActive: boolean) =>
    isActive
      ? tt("Active", undefined, "Active")
      : tt("Inactive", undefined, "Inactive");

  const getDeviceCountLabel = (count: number) =>
    tt("deviceCount", { count }, "{{count}} device(s)");

  const getUsersPageSummary = (start: number, end: number, total: number) =>
    tt("usersPaginationSummary", { start, end, total }, "Showing {{start}} to {{end}} of {{total}} users");

  const getDevicesPageSummary = (start: number, end: number, total: number) =>
    tt("devicesPaginationSummary", { start, end, total }, "Showing {{start}} to {{end}} of {{total}} devices");

  const getAllAppsLabel = () => tt("All Apps", undefined, "All Apps");
  const getAllPlatformsLabel = () => tt("All Platforms", undefined, "All Platforms");
  const getAllProvidersLabel = () => tt("All Providers", undefined, "All Providers");
  const getAllStatusLabel = () => tt("All Status", undefined, "All Status");
  const getImportAudienceLabel = () => tt("Import Audience", undefined, "Import Audience");
  const getNoUsersFoundLabel = () => tt("No users found", undefined, "No users found");
  const getNoDevicesFoundLabel = () => tt("No devices found", undefined, "No devices found");
  const getSearchUsersPlaceholder = () =>
    tt(
      "Search by user ID or nickname...",
      undefined,
      "Search by user ID or nickname...",
    );
  const getUserIdLabel = () => tt("User ID", undefined, "User ID");
  const getViewLabel = () => tt("View", undefined, "View");
  const getPlatformLabelHeader = () => tt("Platform", undefined, "Platform");
  const getProviderLabelHeader = () => tt("Provider", undefined, "Provider");
  const getUserLabel = () => tt("User", undefined, "User");
  const getStatusHeaderLabel = () => tt("Status", undefined, "Status");
  const getTargetAppRequiredLabel = () =>
    tt("Target App Required", undefined, "Target App Required");
  const getTargetAppDescriptionLabel = () =>
    tt(
      "Please select an application from the filters above to specify which app the audience belongs to.",
      undefined,
      "Please select an application from the filters above to specify which app the audience belongs to.",
    );
  const getSelectTargetAppLabel = () =>
    tt("Select Target App...", undefined, "Select Target App...");
  const getUserDisplayName = (user: { externalUserId: string; nickname?: string | null }) =>
    getPreferredUserName(user);
  const preferredTestTargetSet = useMemo(
    () => new Set(preferredTestTargetIds),
    [preferredTestTargetIds],
  );
  const normalizedTestTargetSearch = testTargetSearch.trim().toLowerCase();
  const visibleTestTargetCandidates = useMemo(() => {
    if (!normalizedTestTargetSearch) {
      return testTargetCandidates.slice(0, MAX_VISIBLE_TEST_TARGET_USERS);
    }

    return testTargetCandidates.filter((candidate) => {
      const displayName = getPreferredUserName(candidate).toLowerCase();
      return (
        displayName.includes(normalizedTestTargetSearch) ||
        candidate.externalUserId.toLowerCase().includes(normalizedTestTargetSearch)
      );
    });
  }, [normalizedTestTargetSearch, testTargetCandidates]);

  const toggleTestTargetCandidate = (externalUserId: string) => {
    const nextIds = preferredTestTargetSet.has(externalUserId)
      ? preferredTestTargetIds.filter((id) => id !== externalUserId)
      : [...preferredTestTargetIds, externalUserId];
    setPreferredTestTargetIds(nextIds);
  };

  const formatRangeStart = (page: number, limit: number) => (page - 1) * limit + 1;
  const formatRangeEnd = (page: number, limit: number, total: number) =>
    Math.min(page * limit, total);

  const localeDateOptions: Intl.DateTimeFormatOptions = {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    };

  const getPlatformIcon = (platform: string) => {
    switch (platform.toLowerCase()) {
      case "android":
        return <Bot className="h-5 w-5 text-emerald-600" />;
      case "ios":
        return <Smartphone className="h-5 w-5 text-slate-700" />;
      case "web":
        return <Globe className="h-5 w-5 text-blue-600" />;
      case "huawei":
        return <Smartphone className="h-5 w-5 text-rose-500" />;
      default:
        return <Smartphone className="h-5 w-5 text-slate-400" />;
    }
  };

  const getProviderBadgeVariant = (provider: string): "warning" | "info" | "error" | "default" => {
    const map: Record<string, "warning" | "info" | "error" | "default"> = {
      fcm: "warning",
      apns: "info",
      hms: "error",
      web: "default",
    };
    return map[provider.toLowerCase()] || "default";
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-6">
      {/* Slide-over panel for user details */}
      {selectedUser && (
        <div className="fixed inset-0 z-40">
          <div
            className="absolute inset-0 bg-black/30 backdrop-blur-sm"
            onClick={() => setSelectedUser(null)}
          />
          <div className="absolute inset-y-0 end-0 flex w-full max-w-lg animate-in slide-in-from-right duration-300">
            <Card className="h-full w-full overflow-y-auto rounded-none border-s shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <div>
                  <h3 className="text-xl font-bold text-slate-900">
                    {getUserDisplayName(selectedUser)}
                  </h3>
                  {selectedUser.nickname ? (
                    <p className="mt-1 font-mono text-xs text-slate-500">
                      {selectedUser.externalUserId}
                    </p>
                  ) : null}
                  <p className="mt-1 text-sm text-slate-500">
                    {tt("App")}:{" "}
                    <span className="font-medium">{selectedUser.app.name}</span>
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-rose-600 hover:bg-rose-50"
                    onClick={() => deleteUser(selectedUser.id)}
                  >
                    <Trash2 className="h-4 w-4 me-1" /> {tt("Delete User")}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setSelectedUser(null)}
                  >
                    <X className="h-5 w-5" />
                  </Button>
                </div>
              </div>

              <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <label className="mb-2 block text-sm font-semibold">
                  {tt("Nickname", undefined, "Nickname")}
                </label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    value={nicknameDraft}
                    maxLength={64}
                    onChange={(event) => setNicknameDraft(event.target.value)}
                    placeholder={tt(
                      "Optional display name",
                      undefined,
                      "Optional display name",
                    )}
                    hint={tt(
                      "Used first in Target User IDs / Device IDs selectors.",
                      undefined,
                      "Used first in Target User IDs / Device IDs selectors.",
                    )}
                  />
                  <Button
                    type="button"
                    size="sm"
                    className="shrink-0 self-start"
                    onClick={() => void updateSelectedUserNickname()}
                    disabled={
                      isSavingNickname ||
                      normalizeNickname(nicknameDraft) ===
                        normalizeNickname(selectedUser.nickname)
                    }
                  >
                    {isSavingNickname
                      ? tt("Saving...", undefined, "Saving...")
                      : tt("Save nickname", undefined, "Save nickname")}
                  </Button>
                </div>
                {nicknameStatus ? (
                  <Badge
                    variant={nicknameStatus.type === "success" ? "success" : "error"}
                    className="mt-2"
                  >
                    {nicknameStatus.message}
                  </Badge>
                ) : null}
              </div>

              <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-slate-500">{tt("Language")}</p>
                  <p className="font-medium">{selectedUser.language}</p>
                </div>
                <div>
                  <p className="text-slate-500">{tt("Timezone")}</p>
                  <p className="font-medium">{selectedUser.timezone}</p>
                </div>
                <div>
                  <p className="text-slate-500">{tt("Devices")}</p>
                  <p className="font-medium">{selectedUser.devices?.length || 0}</p>
                </div>
                <div>
                  <p className="text-slate-500">{tt("Created")}</p>
                  <p className="font-medium">
                    {new Date(selectedUser.createdAt).toLocaleDateString(
                      language === "ar" ? "ar" : "en-US",
                      localeDateOptions,
                    )}
                  </p>
                </div>
              </div>

              <h4 className="mt-6 font-semibold">{tt("Registered Devices")}</h4>
              {selectedUser.devices && selectedUser.devices.length > 0 ? (
                <div className="mt-3 space-y-3">
                  {selectedUser.devices.map((device) => (
                    <div
                      key={device.id}
                      className={clsx(
                        "flex items-center justify-between rounded-xl border p-4",
                        device.isActive ? "bg-white" : "bg-slate-50 opacity-60",
                      )}
                    >
                      <div className="flex items-center gap-3">
                        {getPlatformIcon(device.platform)}
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium capitalize">
                              {device.platform}
                            </span>
                            <Badge variant={getProviderBadgeVariant(device.provider)}>
                              {device.provider.toUpperCase()}
                            </Badge>
                            <Badge variant={device.isActive ? "success" : "default"} dot>
                              {device.isActive ? tt("Active") : tt("Inactive")}
                            </Badge>
                          </div>
                          <p
                            className="mt-1 max-w-xs truncate font-mono text-xs text-slate-400"
                            title={device.pushToken}
                          >
                            {device.pushToken}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {tt("Last seen")}: {formatDate(device.lastSeenAt)}
                          </p>
                        </div>
                      </div>
                      {device.isActive ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => deactivateDevice(device.id)}
                        >
                          <XCircle className="h-4 w-4" />
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-emerald-700 hover:bg-emerald-50"
                          onClick={() => activateDevice(device.id)}
                        >
                          <RefreshCw className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState
                  icon={<Smartphone className="h-5 w-5" />}
                  title={tt("No devices registered")}
                  description=""
                />
              )}
            </Card>
          </div>
        </div>
      )}
      {/* Tabs */}
      <div className="inline-flex rounded-xl border bg-white p-1">
        {(
          [
            { key: "users", icon: <Users className="h-4 w-4" />, label: tt("Users", undefined, "Users") },
            { key: "devices", icon: <Smartphone className="h-4 w-4" />, label: tt("Devices", undefined, "Devices") },
            { key: "import", icon: <UploadCloud className="h-4 w-4" />, label: getImportAudienceLabel() },
          ] as const
        ).map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={clsx(
              "flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all",
              activeTab === tab.key
                ? "bg-indigo-600 text-white shadow-sm"
                : "text-slate-600 hover:text-slate-900",
            )}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <Card padding="md">
        <div className="flex flex-wrap items-end gap-4">
          <Select
            value={filterAppId}
            onChange={(e) => setFilterAppId(e.target.value)}
            className="min-w-[150px]"
          >
            {apps.length === 0 ? (
              <option value="">{getAllAppsLabel()}</option>
            ) : (
              apps.map((app) => (
                <option key={app.id} value={app.id}>
                  {app.name}
                </option>
              ))
            )}
          </Select>

          {activeTab === "users" && (
            <form onSubmit={handleSearch} className="min-w-[200px] flex-1">
              <div className="relative">
                <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder={getSearchUsersPlaceholder()}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pe-3.5 ps-10 text-sm shadow-sm transition-all placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
            </form>
          )}
          {activeTab === "devices" && (
            <>
              <Select
                value={filterPlatform}
                onChange={(e) => setFilterPlatform(e.target.value)}
                className="min-w-[120px]"
              >
                <option value="">{getAllPlatformsLabel()}</option>
                <option value="android">{tt("Android", undefined, "Android")}</option>
                <option value="ios">{tt("iOS", undefined, "iOS")}</option>
                <option value="web">{tt("Web", undefined, "Web")}</option>
                <option value="huawei">{tt("Huawei", undefined, "Huawei")}</option>
              </Select>
              <Select
                value={filterProvider}
                onChange={(e) => setFilterProvider(e.target.value)}
                className="min-w-[120px]"
              >
                <option value="">{getAllProvidersLabel()}</option>
                <option value="fcm">{tt("FCM", undefined, "FCM")}</option>
                <option value="apns">{tt("APNS", undefined, "APNS")}</option>
                <option value="hms">{tt("HMS", undefined, "HMS")}</option>
                <option value="web">{tt("Web Push", undefined, "Web Push")}</option>
              </Select>
              <Select
                value={filterActive}
                onChange={(e) => setFilterActive(e.target.value)}
                className="min-w-[120px]"
              >
                <option value="">{getAllStatusLabel()}</option>
                <option value="true">{tt("Active", undefined, "Active")}</option>
                <option value="false">{tt("Inactive", undefined, "Inactive")}</option>
              </Select>
            </>
          )}
          {activeTab !== "import" && (
            <Button
              variant="outline"
              size="icon"
              onClick={() =>
                activeTab === "users" ? fetchUsers() : fetchDevices()
              }
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          )}
        </div>
      </Card>

      {error && (
        <Card padding="sm" className="border-rose-200 bg-rose-50">
          <p className="text-sm text-rose-700">{error}</p>
        </Card>
      )}

      {activeTab === "users" && filterAppId && (
        <details className="group rounded-xl border bg-white">
          <summary className="flex cursor-pointer items-center justify-between gap-3 p-4">
            <div className="flex items-center gap-3">
              <h4 className="text-sm font-semibold text-slate-900">
                {tt("Test notification target users")}
              </h4>
              <span className="text-xs font-medium text-slate-500">
                {hasCustomTestTargetUsers
                  ? tt("{{count}} selected", {
                      count: preferredTestTargetIds.length,
                    })
                  : tt("All users visible")}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {hasCustomTestTargetUsers && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => { e.preventDefault(); clearPreferredTestTargetIds(); }}
                >
                  {tt("Clear")}
                </Button>
              )}
              <ChevronRight className="h-4 w-4 text-slate-400 transition-transform group-open:rotate-90" />
            </div>
          </summary>

          <div className="space-y-3 border-t p-4">
            <p className="text-xs text-slate-500">
              {tt(
                "Only these users appear in Test notification target selectors across Send, Campaigns, and A/B Testing.",
              )}
            </p>

            <div className="relative">
              <Search className="absolute start-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                value={testTargetSearch}
                onChange={(event) => setTestTargetSearch(event.target.value)}
                placeholder={tt("Filter users for test target list...")}
                className="w-full ps-10 pe-4 py-2.5 border border-slate-200 rounded-xl text-sm shadow-sm transition-all placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>

            <div className="max-h-56 overflow-y-auto rounded-xl border border-slate-200 divide-y">
            {isLoadingTestTargetUsers ? (
              <div className="p-3 text-sm text-slate-500">
                {tt("Loading users...")}
              </div>
            ) : visibleTestTargetCandidates.length === 0 ? (
              <div className="p-3 text-sm text-slate-500">
                {testTargetSearch.trim()
                  ? tt("No users match this search.")
                  : tt("No users with active devices in this app.")}
              </div>
            ) : (
              visibleTestTargetCandidates.map((candidate) => (
                <label
                  key={candidate.externalUserId}
                  className="flex items-center justify-between gap-3 px-3 py-2 hover:bg-slate-50 cursor-pointer"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">
                      {getUserDisplayName(candidate)}
                    </p>
                    <p className="text-xs text-slate-500 font-mono truncate">
                      {candidate.externalUserId}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-xs text-slate-500">
                      {tt("{{count}} devices", { count: candidate.devicesCount })}
                    </span>
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-300"
                      checked={preferredTestTargetSet.has(candidate.externalUserId)}
                      onChange={() => toggleTestTargetCandidate(candidate.externalUserId)}
                    />
                  </div>
                </label>
              ))
            )}
          </div>

            {!normalizedTestTargetSearch &&
              testTargetCandidates.length > MAX_VISIBLE_TEST_TARGET_USERS && (
                <p className="text-xs text-slate-500">
                  {tt(
                    "Showing first {{count}} users. Use search to find additional users.",
                    { count: MAX_VISIBLE_TEST_TARGET_USERS },
                  )}
                </p>
              )}

            {testTargetUsersError && (
              <p className="text-xs text-rose-600">{testTargetUsersError}</p>
            )}
          </div>
        </details>
      )}

      {/* Users List */}
      {activeTab === "users" && (
        <Card padding="sm" className="overflow-hidden">
          {isLoading ? (
            <SkeletonTable rows={5} />
          ) : users.length === 0 ? (
            <EmptyState
              icon={<Users className="h-6 w-6" />}
              title={
                searchQuery
                  ? tt(
                      "No users found matching \"{{query}}\"",
                      { query: searchQuery },
                      "No users found matching \"{{query}}\"",
                    )
                  : getNoUsersFoundLabel()
              }
              description=""
              action={
                searchQuery
                  ? {
                      label: tt("Clear search", undefined, "Clear search"),
                      onClick: () => setSearchQuery(""),
                    }
                  : undefined
              }
            />
          ) : (
            <>
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-start px-4 py-3 font-medium text-gray-600">
                      {getUserIdLabel()}
                    </th>
                    <th className="text-start px-4 py-3 font-medium text-gray-600">
                      {tt("App", undefined, "App")}
                    </th>
                    <th className="text-start px-4 py-3 font-medium text-gray-600">
                      {tt("Language", undefined, "Language")}
                    </th>
                    <th className="text-start px-4 py-3 font-medium text-gray-600">
                      {tt("Devices", undefined, "Devices")}
                    </th>
                    <th className="text-start px-4 py-3 font-medium text-gray-600">
                      {tt("Created", undefined, "Created")}
                    </th>
                    <th className="text-start px-4 py-3 font-medium text-gray-600"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {users.map((user) => (
                    <tr key={user.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 max-w-[200px]">
                        <span className="block truncate font-medium">
                          {getUserDisplayName(user)}
                        </span>
                        {user.nickname ? (
                          <p className="truncate text-xs text-gray-500 font-mono" title={user.externalUserId}>
                            {user.externalUserId}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {user.app.name}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {user.language}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="info">
                          {getDeviceCountLabel(user._count.devices)}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-gray-500">
                        {formatDate(user.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => fetchUserDetails(user.id)}
                        >
                          {getViewLabel()}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {usersPagination && usersPagination.totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t bg-gray-50">
                  <p className="text-sm text-gray-500">
                    {getUsersPageSummary(
                      formatRangeStart(
                        usersPagination.page,
                        usersPagination.limit,
                      ),
                      formatRangeEnd(
                        usersPagination.page,
                        usersPagination.limit,
                        usersPagination.total,
                      ),
                      usersPagination.total,
                    )}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => fetchUsers(usersPagination.page - 1)}
                      disabled={usersPagination.page <= 1}
                    >
                      <PrevIcon className="w-4 h-4" />
                    </Button>
                    <span className="text-sm text-gray-600 min-w-max">
                      {tt("Page {{page}} of {{totalPages}}", {
                        page: usersPagination.page,
                        totalPages: usersPagination.totalPages,
                      })}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => fetchUsers(usersPagination.page + 1)}
                      disabled={
                        usersPagination.page >= usersPagination.totalPages
                      }
                    >
                      <NextIcon className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </Card>
      )}

      {/* Devices List */}
      {activeTab === "devices" && (
        <Card padding="sm" className="overflow-hidden">
          {isLoading ? (
            <SkeletonTable rows={5} />
          ) : devices.length === 0 ? (
            <EmptyState
              icon={<Smartphone className="h-6 w-6" />}
              title={getNoDevicesFoundLabel()}
              description=""
            />
          ) : (
            <>
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-start px-4 py-3 font-medium text-gray-600">
                      {getPlatformLabelHeader()}
                    </th>
                    <th className="text-start px-4 py-3 font-medium text-gray-600">
                      {getProviderLabelHeader()}
                    </th>
                    <th className="text-start px-4 py-3 font-medium text-gray-600">
                      {getUserLabel()}
                    </th>
                    <th className="text-start px-4 py-3 font-medium text-gray-600">
                      {getStatusHeaderLabel()}
                    </th>
                    <th className="text-start px-4 py-3 font-medium text-gray-600">
                      {tt("Last seen", undefined, "Last seen")}
                    </th>
                    <th className="text-start px-4 py-3 font-medium text-gray-600"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {devices.map((device) => (
                    <tr
                      key={device.id}
                      className={clsx(
                        "hover:bg-gray-50",
                        !device.isActive && "opacity-60",
                      )}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {getPlatformIcon(device.platform)}
                          <span className="capitalize">
                            {getPlatformLabel(device.platform)}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={getProviderBadgeVariant(device.provider)}>
                          {getProviderLabel(device.provider)}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        {device.user && (
                          <div>
                            <p className="font-medium">
                              {getUserDisplayName(device.user)}
                            </p>
                            {device.user.nickname ? (
                              <p className="text-xs text-gray-500 font-mono">
                                {device.user.externalUserId}
                              </p>
                            ) : null}
                            <p className="text-xs text-gray-400">
                              {device.user.app.name}
                            </p>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={device.isActive ? "success" : "default"} dot>
                          {getStatusLabel(device.isActive)}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-gray-500">
                        {formatDate(device.lastSeenAt)}
                      </td>
                      <td className="px-4 py-3">
                        {device.isActive ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => deactivateDevice(device.id)}
                          >
                            <XCircle className="w-4 h-4" />
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-emerald-700 hover:bg-emerald-50"
                            onClick={() => activateDevice(device.id)}
                          >
                            <RefreshCw className="w-4 h-4" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {devicesPagination && devicesPagination.totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t bg-gray-50">
                  <p className="text-sm text-gray-500">
                    {getDevicesPageSummary(
                      formatRangeStart(
                        devicesPagination.page,
                        devicesPagination.limit,
                      ),
                      formatRangeEnd(
                        devicesPagination.page,
                        devicesPagination.limit,
                        devicesPagination.total,
                      ),
                      devicesPagination.total,
                    )}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => fetchDevices(devicesPagination.page - 1)}
                      disabled={devicesPagination.page <= 1}
                    >
                      <PrevIcon className="w-4 h-4" />
                    </Button>
                    <span className="text-sm text-gray-600 min-w-max">
                      {tt("Page {{page}} of {{totalPages}}", {
                        page: devicesPagination.page,
                        totalPages: devicesPagination.totalPages,
                      })}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => fetchDevices(devicesPagination.page + 1)}
                      disabled={
                        devicesPagination.page >= devicesPagination.totalPages
                      }
                    >
                      <NextIcon className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </Card>
      )}
      {/* Import Audience */}
      {activeTab === "import" && (
        <div className="space-y-6">
          {!filterAppId ? (
            <div className="bg-white rounded-xl border p-12 text-center space-y-4">
              <div className="w-16 h-16 bg-purple-50 rounded-2xl flex items-center justify-center mx-auto">
                <UploadCloud className="w-8 h-8 text-purple-600" />
              </div>
              <div>
                <h4 className="font-bold text-lg">{getTargetAppRequiredLabel()}</h4>
                <p className="text-sm text-gray-500 max-w-xs mx-auto">
                  {getTargetAppDescriptionLabel()}
                </p>
              </div>
              <div className="flex justify-center pt-2">
                <Select
                  value={filterAppId}
                  onChange={(e) => setFilterAppId(e.target.value)}
                  className="px-4 py-2 border rounded-xl text-sm bg-white min-w-50 shadow-sm"
                >
                  <option value="">{getSelectTargetAppLabel()}</option>
                  {apps.map((app) => (
                    <option key={app.id} value={app.id}>
                      {app.name}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
          ) : (
            <AudienceManager appId={filterAppId} />
          )}
        </div>
      )}
    </div>
  );
}
