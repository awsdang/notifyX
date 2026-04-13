import { useState, useEffect, type FormEvent } from "react";
import {
    ArrowLeft,
    Power,
    Edit2,
    Save,
    X,
    MessageSquare,
    Users,
    Layout,
    Megaphone,
    Pause,
    Play,
    UserPlus,
    Mail,
    Upload,
    BellRing,
    Smartphone,
    Globe,
    Apple,
} from "lucide-react";
import { appService, type AppStats, type AppAccessResponse } from "../services/appService";
import type { Application, NotificationHistoryItem } from "../types";
import { Button } from "../components/ui/button";
import { clsx } from "clsx";
import { useConfirmDialog } from "../context/ConfirmDialogContext";
import { useI18n, useScopedTranslation } from "../context/I18nContext";
import { apiFetch } from "../lib/api";
import { uploadAppImageAsset } from "../services/assetService";

interface AppDetailPageProps {
    app: Application;
    token: string | null;
    onBack: () => void;
    onUpdate: (updated?: Application) => void | Promise<void>;
}

export function AppDetailPage({
  app: initialApp,
  token,
  onBack,
  onUpdate,
}: AppDetailPageProps) {
    const { direction } = useI18n();
    const tp = useScopedTranslation("pages", "AppDetailPage");
  const { confirm } = useConfirmDialog();
    const [app, setApp] = useState<Application>(initialApp);
    const [stats, setStats] = useState<AppStats | null>(null);
    const [notifications, setNotifications] = useState<NotificationHistoryItem[]>([]);
    const [appAccess, setAppAccess] = useState<AppAccessResponse>({ members: [], invites: [] });
    const [isLoading, setIsLoading] = useState(true);
    const [isEditingName, setIsEditingName] = useState(false);
    const [newName, setNewName] = useState(initialApp.name);
    const [isSavingName, setIsSavingName] = useState(false);
    const [activeActionId, setActiveActionId] = useState<string | null>(null);
    const [activeActionType, setActiveActionType] = useState<"stop" | "resume" | null>(null);
    const [inviteEmail, setInviteEmail] = useState("");
    const [inviteRole, setInviteRole] = useState<"APP_MANAGER" | "MARKETING_MANAGER">("MARKETING_MANAGER");
    const [isInviting, setIsInviting] = useState(false);
    const [revokingInviteId, setRevokingInviteId] = useState<string | null>(null);
    const [androidNotificationIcon, setAndroidNotificationIcon] = useState(
        initialApp.androidNotificationIcon || "",
    );
    const [isUploadingIcon, setIsUploadingIcon] = useState(false);
    const [isSavingIconSettings, setIsSavingIconSettings] = useState(false);
    const [iconStatus, setIconStatus] = useState<{
        type: "success" | "error";
        message: string;
    } | null>(null);

    useEffect(() => {
        loadData();
    }, [initialApp.id]);

    const loadData = async () => {
        // Only set loading on first load to prevent flickering on updates
        if (!stats) setIsLoading(true);

        try {
            // Fetch latest app details first to get current name/status
            const appData = await appService.getApp(initialApp.id, token);
            setApp(appData);
            setNewName(appData.name);
            setAndroidNotificationIcon(appData.androidNotificationIcon || "");

            const [statsResult, campaignsResult, accessResult] = await Promise.allSettled([
                appService.getAppStats(appData.id, appData.name, token),
                appService.getAppNotifications(appData.id, token),
                appService.getAppAccess(appData.id, token),
            ]);
            if (statsResult.status === "fulfilled") {
                setStats(statsResult.value);
            }
            if (campaignsResult.status === "fulfilled") {
                setNotifications(campaignsResult.value);
            }
            if (accessResult.status === "fulfilled") {
                setAppAccess(accessResult.value);
            } else {
                setAppAccess({ members: [], invites: [] });
            }
        } catch (error) {
            console.error("Failed to load app details", error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleIconUpload = async (file: File) => {
        if (!token) return;

        setIsUploadingIcon(true);
        setIconStatus(null);

        try {
            const asset = await uploadAppImageAsset(app.id, file, token);
            const updated = await appService.updateApp(
                app.id,
                { notificationIconAssetId: asset.id },
                token,
            );
            setApp(updated);
            await onUpdate(updated);
            setIconStatus({
                type: "success",
                message: tp("notificationIconUploaded", "Notification icon uploaded."),
            });
        } catch (error: any) {
            setIconStatus({
                type: "error",
                message:
                    error?.message ||
                    tp("notificationIconUploadFailed", "Failed to upload notification icon."),
            });
        } finally {
            setIsUploadingIcon(false);
        }
    };

    const handleSaveIconSettings = async () => {
        setIsSavingIconSettings(true);
        setIconStatus(null);

        try {
            const updated = await appService.updateApp(
                app.id,
                {
                    androidNotificationIcon: androidNotificationIcon.trim() || null,
                },
                token,
            );
            setApp(updated);
            setAndroidNotificationIcon(updated.androidNotificationIcon || "");
            await onUpdate(updated);
            setIconStatus({
                type: "success",
                message: tp("notificationIconSettingsSaved", "Icon settings saved."),
            });
        } catch (error: any) {
            setIconStatus({
                type: "error",
                message:
                    error?.message ||
                    tp("notificationIconSettingsFailed", "Failed to save icon settings."),
            });
        } finally {
            setIsSavingIconSettings(false);
        }
    };

    const handleClearUploadedIcon = async () => {
        setIsSavingIconSettings(true);
        setIconStatus(null);

        try {
            const updated = await appService.updateApp(
                app.id,
                { notificationIconAssetId: null },
                token,
            );
            setApp(updated);
            await onUpdate(updated);
            setIconStatus({
                type: "success",
                message: tp("notificationIconRemoved", "Uploaded notification icon removed."),
            });
        } catch (error: any) {
            setIconStatus({
                type: "error",
                message:
                    error?.message ||
                    tp("notificationIconRemoveFailed", "Failed to remove uploaded notification icon."),
            });
        } finally {
            setIsSavingIconSettings(false);
        }
    };

    const handleSaveName = async () => {
        if (!newName.trim() || newName === app.name) {
            setIsEditingName(false);
            return;
        }

        setIsSavingName(true);
        try {
            const updated = await appService.updateApp(app.id, { name: newName }, token);
            setApp(updated);
            setNewName(updated.name);
            await onUpdate(updated);
            await loadData(); // Refresh all data with new name
            setIsEditingName(false);
        } catch (error) {
            console.error("Failed to update name", error);
        } finally {
            setIsSavingName(false);
        }
    };

    const handleToggleStatus = async () => {
        const action = app.isKilled ? "activate" : "deactivate";
    const confirmed = await confirm({
      title:
        action === "activate"
          ? tp("confirmActivateAppTitle", "Activate App")
          : tp("confirmDeactivateAppTitle", "Deactivate App"),
      description:
        action === "deactivate"
          ? tp(
              "confirmDeactivateAppDescription",
              "This will cancel all scheduled notifications.",
            )
          : tp(
              "confirmActivateAppDescription",
              "The app will start accepting notifications again.",
            ),
      confirmText:
        action === "activate"
          ? tp("activateApp", "Activate App")
          : tp("deactivateApp", "Deactivate App"),
      destructive: action === "deactivate",
    });
        if (!confirmed) return;

        try {
            if (app.isKilled) {
                const revived = await appService.reviveApp(app.id, token);
                setApp(revived);
                await onUpdate(revived);
            } else {
                const result = await appService.killApp(app.id, token);
                setApp(result.app);
                await onUpdate(result.app);
            }
            await loadData();
        } catch (error) {
            console.error(`Failed to ${action} app`, error);
        }
    };

    const canStop = (status: string) =>
        ["SCHEDULED", "QUEUED"].includes(status.toUpperCase());

    const canResume = (status: string) =>
        ["CANCELLED"].includes(status.toUpperCase());

    const handleStopNotification = async (notification: NotificationHistoryItem) => {
        if (!token) return;
        const confirmed = await confirm({
            title: tp("stopNotificationTitle", "Stop notification?"),
            description: tp(
                "stopNotificationDescription",
                "This will cancel this notification and prevent further sends.",
            ),
            confirmText: tp("stop", "Stop"),
            destructive: true,
        });
        if (!confirmed) return;

        setActiveActionId(notification.id);
        setActiveActionType("stop");
        try {
            await apiFetch(`/notifications/${notification.id}/cancel`, { method: "POST" }, token);
            await loadData();
        } catch (error) {
            console.error("Failed to stop notification", error);
        } finally {
            setActiveActionId(null);
            setActiveActionType(null);
        }
    };

    const handleResumeNotification = async (notification: NotificationHistoryItem) => {
        if (!token) return;
        const confirmed = await confirm({
            title: tp("resumeNotificationTitle", "Resume notification?"),
            description: tp(
                "resumeNotificationDescription",
                "This will queue the notification for immediate delivery.",
            ),
            confirmText: tp("resume", "Resume"),
        });
        if (!confirmed) return;

        setActiveActionId(notification.id);
        setActiveActionType("resume");
        try {
            await apiFetch(`/notifications/${notification.id}/force-send`, { method: "POST" }, token);
            await loadData();
        } catch (error) {
            console.error("Failed to resume notification", error);
        } finally {
            setActiveActionId(null);
            setActiveActionType(null);
        }
    };

    const getNotificationTitle = (item: NotificationHistoryItem) =>
    item.payload?.adhocContent?.title ||
    (item.type === "campaign"
      ? tp("campaignNotification", "Campaign Notification")
      : tp("transactionalNotification", "Transactional Notification"));

    const handleInvite = async (e: FormEvent) => {
        e.preventDefault();
        if (!inviteEmail.trim()) return;
        setIsInviting(true);
        try {
            await appService.inviteAppAccess(
                app.id,
                { email: inviteEmail.trim(), role: inviteRole },
                token,
            );
            setInviteEmail("");
            await loadData();
        } catch (error) {
            console.error("Failed to invite app member", error);
        } finally {
            setIsInviting(false);
        }
    };

    const handleRevokeInvite = async (inviteId: string) => {
        setRevokingInviteId(inviteId);
        try {
            await appService.revokeAppInvite(app.id, inviteId, token);
            await loadData();
        } catch (error) {
            console.error("Failed to revoke invite", error);
        } finally {
            setRevokingInviteId(null);
        }
    };

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Header */}
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" onClick={onBack}>
                        <ArrowLeft
                            className={clsx("w-5 h-5", direction === "rtl" && "-scale-x-100")}
                        />
                    </Button>

                    <div className="space-y-1">
                        <div className="flex items-center gap-3">
                            <AppIconPreview app={app} className="h-14 w-14 rounded-2xl" />
                            {isEditingName ? (
                                <div className="flex items-center gap-2">
                                    <input
                                        className="text-2xl font-bold bg-white border rounded px-2 py-1 min-w-[200px]"
                                        value={newName}
                                        onChange={(e) => setNewName(e.target.value)}
                                        autoFocus
                                    />
                                    <Button
                                        size="icon"
                                        variant="ghost"
                                        onClick={handleSaveName}
                                        disabled={isSavingName}
                                    >
                                        <Save className="w-4 h-4 text-green-600" />
                                    </Button>
                                    <Button
                                        size="icon"
                                        variant="ghost"
                                        onClick={() => {
                                            setIsEditingName(false);
                                            setNewName(app.name);
                                        }}
                                    >
                                        <X className="w-4 h-4 text-red-500" />
                                    </Button>
                                </div>
                            ) : (
                                <>
                                    <h2 className="text-3xl font-black text-slate-900 tracking-tight">
                                        {app.name}
                                    </h2>
                                    <button
                                        onClick={() => setIsEditingName(true)}
                                        className="text-slate-400 hover:text-blue-600 transition-colors"
                                    >
                                        <Edit2 className="w-4 h-4" />
                                    </button>
                                </>
                            )}
                            <span
                                className={clsx(
                                    "px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider",
                                    app.isKilled
                                        ? "bg-red-100 text-red-600"
                                        : "bg-green-100 text-green-600",
                                )}
                            >
                                {app.isKilled
                                    ? tp("statusDeactivated", "Deactivated")
                                    : tp("statusActive", "Active")}
                            </span>
                        </div>
                        <p className="text-slate-500 font-mono text-xs">{app.id}</p>
                    </div>
                </div>

                <div className="flex gap-2">
                    <Button
                        variant="outline"
                        className={clsx(
                            "gap-2",
                            app.isKilled
                                ? "text-green-600 hover:bg-green-50 hover:text-green-700 hover:border-green-200"
                                : "text-amber-600 hover:bg-amber-50 hover:text-amber-700 hover:border-amber-200",
                        )}
                        onClick={handleToggleStatus}
                    >
                        <Power className="w-4 h-4" />
                        {app.isKilled
                            ? tp("activateApp", "Activate App")
                            : tp("deactivateApp", "Deactivate App")}
                    </Button>
                </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <StatCard
                    label={tp("totalNotifications", "Total Notifications")}
                    value={stats?.notifications ?? 0}
                    icon={<MessageSquare className="w-5 h-5 text-blue-500" />}
                    loading={isLoading}
                />
                <StatCard
                    label={tp("registeredUsers", "Registered Users")}
                    value={stats?.users ?? 0}
                    icon={<Users className="w-5 h-5 text-purple-500" />}
                    loading={isLoading}
                />
                <StatCard
                    label={tp("templates", "Templates")}
                    value={stats?.templates ?? 0}
                    icon={<Layout className="w-5 h-5 text-indigo-500" />}
                    loading={isLoading}
                />
            </div>

            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <h3 className="text-lg font-bold text-slate-900">
                        {tp("notificationIcon", "Notification Icon")}
                    </h3>
                </div>

                <div className="rounded-xl border bg-white p-5 shadow-sm">
                    <div className="grid gap-5 lg:grid-cols-[220px_1fr]">
                        <div className="rounded-2xl border border-dashed bg-slate-50 p-5">
                            <div className="flex flex-col items-center text-center">
                                <AppIconPreview app={app} className="h-24 w-24 rounded-3xl" />
                                <p className="mt-3 text-sm font-semibold text-slate-900">
                                    {tp("appIconPreview", "App Icon Preview")}
                                </p>
                                <p className="mt-1 text-xs text-slate-500">
                                    {app.notificationIconUrl
                                        ? tp("webUsesUploadedIcon", "Web notifications use the uploaded icon URL.")
                                        : tp("noUploadedIconYet", "No uploaded notification icon yet.")}
                                </p>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div className="grid gap-4 md:grid-cols-2">
                                <div className="rounded-xl border p-4">
                                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                                        <Globe className="h-4 w-4 text-blue-600" />
                                        {tp("web", "Web")}
                                    </div>
                                    <p className="mt-2 text-sm text-slate-500">
                                        {tp(
                                            "webIconBehavior",
                                            "The uploaded icon URL is sent as the browser notification icon.",
                                        )}
                                    </p>
                                </div>
                                <div className="rounded-xl border p-4">
                                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                                        <Apple className="h-4 w-4 text-slate-700" />
                                        {tp("iphone", "iPhone")}
                                    </div>
                                    <p className="mt-2 text-sm text-slate-500">
                                        {tp(
                                            "iosIconBehavior",
                                            "iOS uses the app icon in the system UI. The uploaded icon is still included in payload data for app-side use.",
                                        )}
                                    </p>
                                </div>
                            </div>

                            <div className="rounded-xl border p-4">
                                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                                    <Smartphone className="h-4 w-4 text-emerald-600" />
                                    {tp("androidTopBar", "Android Top Bar")}
                                </div>
                                <p className="mt-2 text-sm text-slate-500">
                                    {tp(
                                        "androidIconBehavior",
                                        "Android status-bar notifications require a bundled drawable resource name. Set that resource below to replace the default icon.",
                                    )}
                                </p>
                            </div>

                            <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
                                <div>
                                    <label className="mb-2 block text-sm font-medium text-slate-700">
                                        {tp("uploadedNotificationIcon", "Uploaded Notification Icon")}
                                    </label>
                                    <div className="rounded-xl border border-dashed p-4">
                                        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                                            <div className="min-w-0">
                                                <p className="text-sm font-medium text-slate-900">
                                                    {app.notificationIconUrl
                                                        ? tp("iconReady", "Icon uploaded")
                                                        : tp("iconMissing", "No icon uploaded")}
                                                </p>
                                                <p className="truncate text-xs text-slate-500">
                                                    {app.notificationIconUrl || tp("uploadPngJpgWebp", "Upload a PNG, JPG, or WebP image.")}
                                                </p>
                                            </div>
                                            <div className="flex gap-2">
                                                <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
                                                    <Upload className="h-4 w-4" />
                                                    {isUploadingIcon
                                                        ? tp("uploading", "Uploading...")
                                                        : tp("uploadIcon", "Upload Icon")}
                                                    <input
                                                        type="file"
                                                        accept="image/png,image/jpeg,image/webp,image/svg+xml"
                                                        className="hidden"
                                                        disabled={isUploadingIcon}
                                                        onChange={(event) => {
                                                            const file = event.target.files?.[0];
                                                            if (file) {
                                                                void handleIconUpload(file);
                                                            }
                                                            event.currentTarget.value = "";
                                                        }}
                                                    />
                                                </label>
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    disabled={
                                                        isSavingIconSettings ||
                                                        isUploadingIcon ||
                                                        !app.notificationIconUrl
                                                    }
                                                    onClick={() => void handleClearUploadedIcon()}
                                                >
                                                    {tp("remove", "Remove")}
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
                                <div>
                                    <label className="mb-2 block text-sm font-medium text-slate-700">
                                        {tp("androidNotificationIconResource", "Android Notification Icon Resource")}
                                    </label>
                                    <input
                                        className="w-full rounded-lg border p-2.5 text-sm"
                                        value={androidNotificationIcon}
                                        onChange={(event) => setAndroidNotificationIcon(event.target.value)}
                                        placeholder={tp("androidNotificationIconExample", "e.g. ic_stat_notifyx")}
                                    />
                                    <p className="mt-2 text-xs text-slate-500">
                                        {tp(
                                            "androidNotificationIconHint",
                                            "This must match a drawable resource bundled inside the Android app package.",
                                        )}
                                    </p>
                                </div>
                                <Button
                                    type="button"
                                    className="gap-2"
                                    disabled={isSavingIconSettings}
                                    onClick={() => void handleSaveIconSettings()}
                                >
                                    <BellRing className="h-4 w-4" />
                                    {isSavingIconSettings
                                        ? tp("saving", "Saving...")
                                        : tp("saveIconSettings", "Save Icon Settings")}
                                </Button>
                            </div>

                            {iconStatus ? (
                                <div
                                    className={clsx(
                                        "rounded-lg px-3 py-2 text-sm",
                                        iconStatus.type === "success"
                                            ? "bg-emerald-50 text-emerald-700"
                                            : "bg-red-50 text-red-700",
                                    )}
                                >
                                    {iconStatus.message}
                                </div>
                            ) : null}
                        </div>
                    </div>
                </div>
            </div>

            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <h3 className="text-lg font-bold text-slate-900">
                        {tp("workspaceAccess", "Workspace Access")}
                    </h3>
                </div>

                <div className="rounded-xl border bg-white p-5 shadow-sm">
                    <form onSubmit={handleInvite} className="grid gap-3 md:grid-cols-[1fr_auto_auto]">
                        <div className="relative">
                            <Mail className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                            <input
                                type="email"
                                value={inviteEmail}
                                onChange={(e) => setInviteEmail(e.target.value)}
                                placeholder={tp("inviteEmailPlaceholder", "Invite by email")}
                                className="w-full rounded-lg border py-2 ps-9 pe-3 text-sm"
                                required
                            />
                        </div>
                        <select
                            className="rounded-lg border px-3 py-2 text-sm"
                            value={inviteRole}
                            onChange={(e) => setInviteRole(e.target.value as "APP_MANAGER" | "MARKETING_MANAGER")}
                        >
                            <option value="MARKETING_MANAGER">MARKETING_MANAGER</option>
                            <option value="APP_MANAGER">APP_MANAGER</option>
                        </select>
                        <Button type="submit" disabled={isInviting} className="gap-2">
                            <UserPlus className="h-4 w-4" />
                            {isInviting
                                ? tp("inviting", "Inviting...")
                                : tp("inviteUser", "Invite User")}
                        </Button>
                    </form>

                    <div className="mt-5 grid gap-5 lg:grid-cols-2">
                        <div>
                            <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">
                                {tp("currentMembers", "Current Members")}
                            </p>
                            <div className="space-y-2">
                                {appAccess.members.length === 0 ? (
                                    <p className="rounded border border-dashed p-3 text-sm text-slate-400">
                                        {tp("noMembersYet", "No assigned collaborators yet.")}
                                    </p>
                                ) : (
                                    appAccess.members.map((member) => (
                                        <div key={member.assignmentId} className="rounded border px-3 py-2 text-sm">
                                            <p className="font-medium text-slate-900">{member.name}</p>
                                            <p className="text-slate-500">{member.email}</p>
                                            <p className="text-xs uppercase tracking-wide text-indigo-600">{member.role}</p>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>

                        <div>
                            <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">
                                {tp("pendingInvites", "Pending Invites")}
                            </p>
                            <div className="space-y-2">
                                {appAccess.invites.length === 0 ? (
                                    <p className="rounded border border-dashed p-3 text-sm text-slate-400">
                                        {tp("noPendingInvites", "No pending invites.")}
                                    </p>
                                ) : (
                                    appAccess.invites.map((invite) => (
                                        <div key={invite.id} className="rounded border px-3 py-2 text-sm">
                                            <div className="flex items-start justify-between gap-3">
                                                <div>
                                                    <p className="font-medium text-slate-900">{invite.email}</p>
                                                    <p className="text-xs uppercase tracking-wide text-amber-600">
                                                        {invite.role}
                                                    </p>
                                                    <p className="text-xs text-slate-500">
                                                        {tp("inviteExpires", "Expires")}:{" "}
                                                        {invite.expiresAt
                                                            ? new Date(invite.expiresAt).toLocaleDateString()
                                                            : tp("never", "Never")}
                                                    </p>
                                                </div>
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    disabled={revokingInviteId === invite.id}
                                                    onClick={() => void handleRevokeInvite(invite.id)}
                                                >
                                                    {revokingInviteId === invite.id
                                                        ? tp("revoking", "Revoking...")
                                                        : tp("revoke", "Revoke")}
                                                </Button>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Notification History */}
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <h3 className="text-lg font-bold text-slate-900">
                        {tp("notificationHistory", "Notification History")}
                    </h3>
                </div>

                <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
                    {isLoading && notifications.length === 0 ? (
                        <div className="p-8 text-center text-gray-400">
                            {tp("loadingHistory", "Loading history...")}
                        </div>
                    ) : notifications.length === 0 ? (
                        <div className="p-12 text-center text-gray-400 flex flex-col items-center">
                            <Megaphone className="w-12 h-12 mb-4 opacity-50" />
                            <p>{tp("noNotificationsYet", "No notifications yet.")}</p>
                        </div>
                    ) : (
                        <table className="w-full text-sm text-start">
                            <thead className="bg-slate-50 border-b text-slate-500 font-medium">
                                <tr>
                                    <th className="px-6 py-3">
                                        {tp("notification", "Notification")}
                                    </th>
                                    <th className="px-6 py-3">{tp("type", "Type")}</th>
                                    <th className="px-6 py-3">{tp("status", "Status")}</th>
                                    <th className="px-6 py-3">
                                        {tp("scheduledFor", "Scheduled For")}
                                    </th>
                                    <th className="px-6 py-3">{tp("created", "Created")}</th>
                                    <th className="px-6 py-3">{tp("actions", "Actions")}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {notifications.map((n) => (
                                    <tr key={n.id} className="hover:bg-slate-50">
                                        <td className="px-6 py-4 font-medium text-slate-900">
                                            {getNotificationTitle(n)}
                                        </td>
                                        <td className="px-6 py-4 text-slate-600 uppercase text-xs font-bold tracking-wide">
                                            {n.type}
                                        </td>
                                        <td className="px-6 py-4">
                                            <span
                                                className={clsx(
                                                    "px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider",
                                                    n.status === "SENT" || n.status === "COMPLETED"
                                                        ? "bg-green-100 text-green-600"
                                                        : n.status === "SCHEDULED"
                                                            ? "bg-blue-100 text-blue-600"
                                                            : n.status === "FAILED" || n.status === "CANCELLED"
                                                            ? "bg-red-100 text-red-600"
                                                            : "bg-gray-100 text-gray-600",
                                                )}
                                            >
                                                {n.status}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-slate-600">
                                            {new Date(n.sendAt).toLocaleString()}
                                        </td>
                                        <td className="px-6 py-4 text-slate-400">
                                            {new Date(n.createdAt).toLocaleDateString()}
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2">
                                                {canStop(n.status) ? (
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        className="h-7 gap-1 border-red-200 text-red-700 hover:bg-red-50"
                                                        disabled={activeActionId === n.id}
                                                        onClick={() => void handleStopNotification(n)}
                                                    >
                                                        <Pause className="h-3.5 w-3.5" />
                                                        {activeActionId === n.id && activeActionType === "stop"
                                                            ? tp("stopping", "Stopping...")
                                                            : tp("stop", "Stop")}
                                                    </Button>
                                                ) : null}
                                                {canResume(n.status) ? (
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        className="h-7 gap-1 border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                                                        disabled={activeActionId === n.id}
                                                        onClick={() => void handleResumeNotification(n)}
                                                    >
                                                        <Play className="h-3.5 w-3.5" />
                                                        {activeActionId === n.id && activeActionType === "resume"
                                                            ? tp("resuming", "Resuming...")
                                                            : tp("resume", "Resume")}
                                                    </Button>
                                                ) : (
                                                    <span className="text-xs text-slate-400">-</span>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>
    );
}

function AppIconPreview({
    app,
    className,
}: {
    app: Application;
    className?: string;
}) {
    if (app.notificationIconUrl) {
        return (
            <img
                src={app.notificationIconUrl}
                alt={app.name}
                className={clsx("object-cover shadow-sm", className)}
            />
        );
    }

    return (
        <div
            className={clsx(
                "flex items-center justify-center bg-linear-to-br from-slate-900 via-slate-700 to-slate-500 text-xl font-black uppercase text-white shadow-sm",
                className,
            )}
        >
            {app.name.slice(0, 1)}
        </div>
    );
}

function StatCard({
    label,
    value,
    icon,
    loading,
}: {
    label: string;
    value: number;
    icon: React.ReactNode;
    loading: boolean;
}) {
    return (
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between">
            <div>
                <p className="text-sm font-medium text-slate-500 mb-1">{label}</p>
                {loading ? (
                    <div className="h-8 w-24 bg-slate-100 rounded animate-pulse" />
                ) : (
                    <p className="text-3xl font-black text-slate-900">
                        {value.toLocaleString()}
                    </p>
                )}
            </div>
            <div className="p-3 bg-slate-50 rounded-xl">{icon}</div>
        </div>
    );
}
