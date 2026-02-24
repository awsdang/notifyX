import { useEffect, useMemo, useState } from "react";
import { Button } from "./ui/button";
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

function getApiBaseUrl(): string {
  const configured = import.meta.env.VITE_API_URL || "http://localhost:3000";
  return configured.endsWith("/api/v1")
    ? configured
    : `${configured.replace(/\/$/, "")}/api/v1`;
}

const API_URL = getApiBaseUrl();
const API_KEY = import.meta.env.VITE_API_KEY || "";
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
    const headers: HeadersInit = {
      "Content-Type": "application/json",
      ...(token && { Authorization: `Bearer ${token}` }),
      ...(API_KEY && { "X-API-Key": API_KEY }),
      ...options.headers,
    };
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
    // New envelope
    if (json && typeof json === "object" && "error" in json && "data" in json) {
      return json.data as T;
    }
    // Legacy envelope
    if (
      json &&
      typeof json === "object" &&
      "success" in json &&
      "data" in json
    ) {
      return json.data as T;
    }
    return json as T;
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
        return "🤖";
      case "ios":
        return "🍎";
      case "web":
        return "🌐";
      case "huawei":
        return "📱";
      default:
        return "📱";
    }
  };

  const getProviderBadge = (provider: string) => {
    const colors: Record<string, string> = {
      fcm: "bg-orange-100 text-orange-700",
      apns: "bg-blue-100 text-blue-700",
      hms: "bg-red-100 text-red-700",
      web: "bg-purple-100 text-purple-700",
    };
    return colors[provider.toLowerCase()] || "bg-gray-100 text-gray-700";
  };

  // User Details View
  if (selectedUser) {
    return (
      <div className="space-y-6">
        <button
          onClick={() => setSelectedUser(null)}
          className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1"
        >
          <PrevIcon className="w-4 h-4" /> {tt("Back to Users")}
        </button>

        <div className="bg-white rounded-xl border p-6">
          <div className="flex justify-between items-start mb-6">
            <div>
              <h3 className="text-xl font-semibold">
                {getUserDisplayName(selectedUser)}
              </h3>
              {selectedUser.nickname ? (
                <p className="text-xs text-gray-500 mt-1 font-mono">
                  {selectedUser.externalUserId}
                </p>
              ) : null}
              <p className="text-sm text-gray-500 mt-1">
                {tt("App")}:{" "}
                <span className="font-medium">{selectedUser.app.name}</span>
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="text-red-600 hover:bg-red-50"
              onClick={() => deleteUser(selectedUser.id)}
            >
              <Trash2 className="w-4 h-4 me-2" /> {tt("Delete User")}
            </Button>
          </div>

          <div className="mb-6 rounded-lg border border-slate-200 bg-slate-50 p-4">
            <label className="block text-sm font-semibold mb-2">
              {tt("Nickname", undefined, "Nickname")}
            </label>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={nicknameDraft}
                maxLength={64}
                onChange={(event) => setNicknameDraft(event.target.value)}
                placeholder={tt(
                  "Optional display name",
                  undefined,
                  "Optional display name",
                )}
                className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              />
              <Button
                type="button"
                size="sm"
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
            <p className="mt-2 text-xs text-slate-500">
              {tt(
                "Used first in Target User IDs / Device IDs selectors.",
                undefined,
                "Used first in Target User IDs / Device IDs selectors.",
              )}
            </p>
            {nicknameStatus ? (
              <p
                className={clsx(
                  "mt-2 text-xs font-medium",
                  nicknameStatus.type === "success"
                    ? "text-emerald-700"
                    : "text-rose-700",
                )}
              >
                {nicknameStatus.message}
              </p>
            ) : null}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 text-sm">
            <div>
              <p className="text-gray-500">{tt("Language")}</p>
              <p className="font-medium">{selectedUser.language}</p>
            </div>
            <div>
              <p className="text-gray-500">{tt("Timezone")}</p>
              <p className="font-medium">{selectedUser.timezone}</p>
            </div>
            <div>
              <p className="text-gray-500">{tt("Devices")}</p>
              <p className="font-medium">{selectedUser.devices?.length || 0}</p>
            </div>
            <div>
              <p className="text-gray-500">{tt("Created")}</p>
              <p className="font-medium">
                {new Date(selectedUser.createdAt).toLocaleDateString(
                  language === "ar" ? "ar" : "en-US",
                  localeDateOptions,
                )}
              </p>
            </div>
          </div>

          <h4 className="font-semibold mb-4">{tt("Registered Devices")}</h4>
          {selectedUser.devices && selectedUser.devices.length > 0 ? (
            <div className="space-y-3">
              {selectedUser.devices.map((device) => (
                <div
                  key={device.id}
                  className={clsx(
                    "p-4 rounded-lg border flex justify-between items-center",
                    device.isActive ? "bg-white" : "bg-gray-50 opacity-60",
                  )}
                >
                  <div className="flex items-center gap-4">
                    <span className="text-2xl">
                      {getPlatformIcon(device.platform)}
                    </span>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium capitalize">
                          {device.platform}
                        </span>
                        <span
                          className={clsx(
                            "text-xs px-2 py-0.5 rounded-full",
                            getProviderBadge(device.provider),
                          )}
                        >
                          {device.provider.toUpperCase()}
                        </span>
                        {device.isActive ? (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                            {tt("Active")}
                          </span>
                        ) : (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                            {tt("Inactive")}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400 font-mono mt-1 truncate max-w-md">
                        {device.pushToken.slice(0, 50)}...
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
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
                      <XCircle className="w-4 h-4 me-1" /> {tt("Deactivate")}
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-emerald-700 hover:bg-emerald-50"
                      onClick={() => activateDevice(device.id)}
                    >
                      <RefreshCw className="w-4 h-4 me-1" /> {tt("Activate")}
                    </Button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-400 text-center py-8">
              {tt("No devices registered")}
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="flex gap-2">
        <button
          onClick={() => setActiveTab("users")}
          className={clsx(
            "px-4 py-2 rounded-lg font-medium text-sm flex items-center gap-2 transition-colors",
            activeTab === "users"
              ? "bg-blue-600 text-white"
              : "bg-white border text-gray-600 hover:bg-gray-50",
          )}
        >
          <Users className="w-4 h-4" /> {tt("Users", undefined, "Users")}
        </button>
        <button
          onClick={() => setActiveTab("devices")}
          className={clsx(
            "px-4 py-2 rounded-lg font-medium text-sm flex items-center gap-2 transition-colors",
            activeTab === "devices"
              ? "bg-blue-600 text-white"
              : "bg-white border text-gray-600 hover:bg-gray-50",
          )}
        >
          <Smartphone className="w-4 h-4" /> {tt("Devices", undefined, "Devices")}
        </button>
        <button
          onClick={() => setActiveTab("import")}
          className={clsx(
            "px-4 py-2 rounded-lg font-medium text-sm flex items-center gap-2 transition-colors",
            activeTab === "import"
              ? "bg-purple-600 text-white"
              : "bg-white border text-gray-600 hover:bg-gray-50",
          )}
        >
          <UploadCloud className="w-4 h-4" /> {getImportAudienceLabel()}
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border p-4">
        <div className="flex flex-wrap gap-4">
          <select
            value={filterAppId}
            onChange={(e) => setFilterAppId(e.target.value)}
            className="px-3 py-2 border rounded-lg text-sm bg-white min-w-37.5"
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
          </select>

          {activeTab === "users" && (
            <form onSubmit={handleSearch} className="flex-1 min-w-50">
              <div className="relative">
                <Search className="absolute start-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input
                  type="text"
                  placeholder={getSearchUsersPlaceholder()}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full ps-10 pe-4 py-2 border rounded-lg text-sm"
                />
              </div>
            </form>
          )}
          {activeTab === "devices" && (
            <>
              <select
                value={filterPlatform}
                onChange={(e) => setFilterPlatform(e.target.value)}
                className="px-3 py-2 border rounded-lg text-sm bg-white min-w-30"
              >
                <option value="">{getAllPlatformsLabel()}</option>
                <option value="android">{tt("Android", undefined, "Android")}</option>
                <option value="ios">{tt("iOS", undefined, "iOS")}</option>
                <option value="web">{tt("Web", undefined, "Web")}</option>
                <option value="huawei">{tt("Huawei", undefined, "Huawei")}</option>
              </select>
              <select
                value={filterProvider}
                onChange={(e) => setFilterProvider(e.target.value)}
                className="px-3 py-2 border rounded-lg text-sm bg-white min-w-30"
              >
                <option value="">{getAllProvidersLabel()}</option>
                <option value="fcm">{tt("FCM", undefined, "FCM")}</option>
                <option value="apns">{tt("APNS", undefined, "APNS")}</option>
                <option value="hms">{tt("HMS", undefined, "HMS")}</option>
                <option value="web">{tt("Web Push", undefined, "Web Push")}</option>
              </select>
              <select
                value={filterActive}
                onChange={(e) => setFilterActive(e.target.value)}
                className="px-3 py-2 border rounded-lg text-sm bg-white min-w-30"
              >
                <option value="">{getAllStatusLabel()}</option>
                <option value="true">{tt("Active", undefined, "Active")}</option>
                <option value="false">{tt("Inactive", undefined, "Inactive")}</option>
              </select>
            </>
          )}
          {activeTab !== "import" && (
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                activeTab === "users" ? fetchUsers() : fetchDevices()
              }
            >
              <RefreshCw className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">
          {error}
        </div>
      )}

      {activeTab === "users" && filterAppId && (
        <div className="bg-white rounded-xl border p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h4 className="text-sm font-semibold text-slate-900">
                {tt("Test notification target users")}
              </h4>
              <p className="text-xs text-slate-500 mt-1">
                {tt(
                  "Only these users appear in Test notification target selectors across Send, Campaigns, and A/B Testing.",
                )}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-slate-600">
                {hasCustomTestTargetUsers
                  ? tt("{{count}} selected", {
                      count: preferredTestTargetIds.length,
                    })
                  : tt("All users are currently visible in test selectors.")}
              </span>
              {hasCustomTestTargetUsers && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={clearPreferredTestTargetIds}
                >
                  {tt("Clear")}
                </Button>
              )}
            </div>
          </div>

          <div className="relative">
            <Search className="absolute start-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              value={testTargetSearch}
              onChange={(event) => setTestTargetSearch(event.target.value)}
              placeholder={tt("Filter users for test target list...")}
              className="w-full ps-10 pe-4 py-2 border rounded-lg text-sm"
            />
          </div>

          <div className="max-h-56 overflow-y-auto rounded-lg border border-slate-200 divide-y">
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
      )}

      {/* Users List */}
      {activeTab === "users" && (
        <div className="bg-white rounded-xl border overflow-hidden">
          {isLoading ? (
            <div className="p-8 text-center text-gray-400">
              {tt("Loading...", undefined, "Loading...")}
            </div>
          ) : users.length === 0 ? (
            <div className="p-12 text-center text-gray-400">
              <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>{getNoUsersFoundLabel()}</p>
            </div>
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
                      <td className="px-4 py-3">
                        <span className="font-medium">
                          {getUserDisplayName(user)}
                        </span>
                        {user.nickname ? (
                          <p className="text-xs text-gray-500 font-mono">
                            {user.externalUserId}
                          </p>
                        ) : null}
                        <p className="text-xs text-gray-400 font-mono">
                          {user.id}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {user.app.name}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {user.language}
                      </td>
                      <td className="px-4 py-3">
                        <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full text-xs">
                          {getDeviceCountLabel(user._count.devices)}
                        </span>
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
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => fetchUsers(usersPagination.page - 1)}
                      disabled={usersPagination.page <= 1}
                    >
                      <PrevIcon className="w-4 h-4" />
                    </Button>
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
        </div>
      )}

      {/* Devices List */}
      {activeTab === "devices" && (
        <div className="bg-white rounded-xl border overflow-hidden">
          {isLoading ? (
            <div className="p-8 text-center text-gray-400">
              {tt("Loading...", undefined, "Loading...")}
            </div>
          ) : devices.length === 0 ? (
            <div className="p-12 text-center text-gray-400">
              <Smartphone className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>{getNoDevicesFoundLabel()}</p>
            </div>
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
                          <span className="text-xl">
                            {getPlatformIcon(device.platform)}
                          </span>
                          <span className="capitalize">
                            {getPlatformLabel(device.platform)}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={clsx(
                            "text-xs px-2 py-0.5 rounded-full",
                            getProviderBadge(device.provider),
                          )}
                        >
                          {getProviderLabel(device.provider)}
                        </span>
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
                        {device.isActive ? (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                            {getStatusLabel(true)}
                          </span>
                        ) : (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                            {getStatusLabel(false)}
                          </span>
                        )}
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
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => fetchDevices(devicesPagination.page - 1)}
                      disabled={devicesPagination.page <= 1}
                    >
                      <PrevIcon className="w-4 h-4" />
                    </Button>
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
        </div>
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
                <select
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
                </select>
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
