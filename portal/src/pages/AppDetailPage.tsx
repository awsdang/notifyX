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
  UserPlus,
  Mail,
  Upload,
  BellRing,
  Smartphone,
  Globe,
  Apple,
  History,
  Zap,
  Filter,
  Key,
  ChevronRight,
} from "lucide-react";
import {
  appService,
  type AppStats,
  type AppAccessResponse,
} from "../services/appService";
import type { Application, NotificationHistoryItem } from "../types";
import { Button } from "../components/ui/button";
import { Card, CardHeader, CardTitle } from "../components/ui/Card";
import { Input, Select } from "../components/ui/Input";
import { Badge } from "../components/ui/Badge";
import { EmptyState } from "../components/ui/EmptyState";
import { StatCard as SharedStatCard } from "../components/StatCard";
import { clsx } from "clsx";
import { useConfirmDialog } from "../context/ConfirmDialogContext";
import { useI18n, useScopedTranslation } from "../context/I18nContext";
import { useNavigate } from "react-router-dom";
import { uploadAppImageAsset } from "../services/assetService";
import {
  APP_DEFAULT_TAP_ACTION_OPTIONS,
  appDefaultTapActionNeedsValue,
  getCtaValuePlaceholder,
  type AppDefaultTapActionType,
} from "../constants/cta";

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
  const navigate = useNavigate();
  const [app, setApp] = useState<Application>(initialApp);
  const [stats, setStats] = useState<AppStats | null>(null);
  const [notifications, setNotifications] = useState<NotificationHistoryItem[]>(
    [],
  );
  const [appAccess, setAppAccess] = useState<AppAccessResponse>({
    members: [],
    invites: [],
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isEditingName, setIsEditingName] = useState(false);
  const [newName, setNewName] = useState(initialApp.name);
  const [isSavingName, setIsSavingName] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<
    "APP_MANAGER" | "MARKETING_MANAGER"
  >("MARKETING_MANAGER");
  const [isInviting, setIsInviting] = useState(false);
  const [revokingInviteId, setRevokingInviteId] = useState<string | null>(null);
  const [androidNotificationIcon, setAndroidNotificationIcon] = useState(
    initialApp.androidNotificationIcon || "",
  );
  const [isUploadingIcon, setIsUploadingIcon] = useState(false);
  const [isSavingIconSettings, setIsSavingIconSettings] = useState(false);
  const [defaultTapActionType, setDefaultTapActionType] = useState<AppDefaultTapActionType>(
    initialApp.defaultTapActionType || "none",
  );
  const [defaultTapActionValue, setDefaultTapActionValue] = useState(
    initialApp.defaultTapActionValue || "",
  );
  const [isSavingTapActionSettings, setIsSavingTapActionSettings] = useState(false);
  const [iconStatus, setIconStatus] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [tapActionStatus, setTapActionStatus] = useState<{
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
      setDefaultTapActionType(appData.defaultTapActionType || "none");
      setDefaultTapActionValue(appData.defaultTapActionValue || "");

      const [statsResult, campaignsResult, accessResult] =
        await Promise.allSettled([
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
          tp(
            "notificationIconUploadFailed",
            "Failed to upload notification icon.",
          ),
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

  const handleSaveTapActionSettings = async () => {
    setIsSavingTapActionSettings(true);
    setTapActionStatus(null);

    try {
      const needsValue = appDefaultTapActionNeedsValue(defaultTapActionType);
      if (needsValue && !defaultTapActionValue.trim()) {
        throw new Error(
          defaultTapActionType === "deep_link"
            ? tp("defaultTapActionUriRequired", "Default deep link URI is required.")
            : tp("defaultTapActionUrlRequired", "Default URL is required."),
        );
      }

      const updated = await appService.updateApp(
        app.id,
        {
          defaultTapActionType,
          defaultTapActionValue: needsValue
            ? defaultTapActionValue.trim()
            : null,
        },
        token,
      );
      setApp(updated);
      setDefaultTapActionType(updated.defaultTapActionType || "none");
      setDefaultTapActionValue(updated.defaultTapActionValue || "");
      await onUpdate(updated);
      setTapActionStatus({
        type: "success",
        message: tp("defaultTapActionSaved", "Default tap action saved."),
      });
    } catch (error: any) {
      setTapActionStatus({
        type: "error",
        message:
          error?.message ||
          tp(
            "defaultTapActionSaveFailed",
            "Failed to save default tap action.",
          ),
      });
    } finally {
      setIsSavingTapActionSettings(false);
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
        message: tp(
          "notificationIconRemoved",
          "Uploaded notification icon removed.",
        ),
      });
    } catch (error: any) {
      setIconStatus({
        type: "error",
        message:
          error?.message ||
          tp(
            "notificationIconRemoveFailed",
            "Failed to remove uploaded notification icon.",
          ),
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
      const updated = await appService.updateApp(
        app.id,
        { name: newName },
        token,
      );
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
        <SharedStatCard
          title={tp("totalNotifications", "Total Notifications")}
          value={(stats?.notifications ?? 0).toLocaleString()}
          icon={<MessageSquare className="w-5 h-5" />}
          color="blue"
          loading={isLoading}
        />
        <SharedStatCard
          title={tp("registeredUsers", "Registered Users")}
          value={(stats?.users ?? 0).toLocaleString()}
          icon={<Users className="w-5 h-5" />}
          color="purple"
          loading={isLoading}
        />
        <SharedStatCard
          title={tp("templates", "Templates")}
          value={(stats?.templates ?? 0).toLocaleString()}
          icon={<Layout className="w-5 h-5" />}
          color="blue"
          loading={isLoading}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle icon={<BellRing className="h-5 w-5 text-blue-600" />}>
            {tp("notificationIcon", "Notification Icon")}
          </CardTitle>
        </CardHeader>
        <div>
          <div className="grid gap-5 lg:grid-cols-[220px_1fr]">
            <div className="rounded-2xl border border-dashed bg-slate-50 p-5">
              <div className="flex flex-col items-center text-center">
                <AppIconPreview app={app} className="h-24 w-24 rounded-3xl" />
                <p className="mt-3 text-sm font-semibold text-slate-900">
                  {tp("appIconPreview", "App Icon Preview")}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {app.notificationIconUrl
                    ? tp(
                        "webUsesUploadedIcon",
                        "Web notifications use the uploaded icon URL.",
                      )
                    : tp(
                        "noUploadedIconYet",
                        "No uploaded notification icon yet.",
                      )}
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
                    {tp(
                      "uploadedNotificationIcon",
                      "Uploaded Notification Icon",
                    )}
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
                          {/* {app.notificationIconUrl || tp("uploadPngJpgWebp", "Upload a PNG, JPG, or WebP image.")} */}
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
                    {tp(
                      "androidNotificationIconResource",
                      "Android Notification Icon Resource",
                    )}
                  </label>
                  <Input
                    value={androidNotificationIcon}
                    onChange={(event) =>
                      setAndroidNotificationIcon(event.target.value)
                    }
                    placeholder={tp(
                      "androidNotificationIconExample",
                      "e.g. ic_stat_notifyx",
                    )}
                  
                  />
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
                <Badge
                  variant={iconStatus.type === "success" ? "success" : "error"}
                  className="w-full rounded-xl px-3 py-2 text-sm"
                >
                  {iconStatus.message}
                </Badge>
              ) : null}

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                <div className="flex items-start gap-3">
                  <Zap className="mt-0.5 h-5 w-5 text-amber-600" />
                  <div className="min-w-0 flex-1 space-y-4">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900">
                        {tp("defaultTapAction", "Default Tap Action")}
                      </h3>
                      <p className="mt-1 text-sm text-slate-500">
                        {tp(
                          "defaultTapActionHint",
                          "Used whenever a notification chooses Open Default instead of sending a custom URL or deep link.",
                        )}
                      </p>
                    </div>

                    <div className="grid gap-4 md:grid-cols-[220px_1fr_auto] md:items-end">
                      <div>
                        <label className="mb-2 block text-sm font-medium text-slate-700">
                          {tp("action", "Action")}
                        </label>
                        <Select
                          value={defaultTapActionType}
                          onChange={(event) => {
                            const nextType = event.target.value as AppDefaultTapActionType;
                            setDefaultTapActionType(nextType);
                            if (!appDefaultTapActionNeedsValue(nextType)) {
                              setDefaultTapActionValue("");
                            }
                          }}
                        >
                          {APP_DEFAULT_TAP_ACTION_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {tp(option.label, option.label)}
                            </option>
                          ))}
                        </Select>
                      </div>

                      <div>
                        <label className="mb-2 block text-sm font-medium text-slate-700">
                          {defaultTapActionType === "deep_link"
                            ? tp("deepLinkUri", "Deep Link URI")
                            : tp("url", "URL")}
                        </label>
                        <Input
                          value={defaultTapActionValue}
                          onChange={(event) =>
                            setDefaultTapActionValue(event.target.value)
                          }
                          disabled={!appDefaultTapActionNeedsValue(defaultTapActionType)}
                          placeholder={getCtaValuePlaceholder(defaultTapActionType as any)}
                          hint={
                            appDefaultTapActionNeedsValue(defaultTapActionType)
                              ? tp(
                                  "defaultTapActionValueHint",
                                  "This value is used by notifications and CTA buttons that select Open Default.",
                                )
                              : tp(
                                  "defaultTapActionValueNotNeeded",
                                  "Dismiss and No CTA do not need a URL or deep link.",
                                )
                          }
                        />
                      </div>

                      <Button
                        type="button"
                        className="gap-2"
                        disabled={isSavingTapActionSettings}
                        onClick={() => void handleSaveTapActionSettings()}
                      >
                        <Zap className="h-4 w-4" />
                        {isSavingTapActionSettings
                          ? tp("saving", "Saving...")
                          : tp("saveTapAction", "Save Tap Action")}
                      </Button>
                    </div>

                    {tapActionStatus ? (
                      <Badge
                        variant={tapActionStatus.type === "success" ? "success" : "error"}
                        className="w-full rounded-xl px-3 py-2 text-sm"
                      >
                        {tapActionStatus.message}
                      </Badge>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle icon={<Users className="h-5 w-5 text-blue-600" />}>
            {tp("workspaceAccess", "Workspace Access")}
          </CardTitle>
        </CardHeader>

        <form
          onSubmit={handleInvite}
          className="grid gap-3 md:grid-cols-[1fr_auto_auto]"
        >
          <div className="relative">
            <Mail className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder={tp("inviteEmailPlaceholder", "Invite by email")}
              className="w-full rounded-xl border border-slate-200 bg-white py-2.5 ps-9 pe-3.5 text-sm shadow-sm transition-all placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              required
            />
          </div>
          <Select
            value={inviteRole}
            onChange={(e) =>
              setInviteRole(
                e.target.value as "APP_MANAGER" | "MARKETING_MANAGER",
              )
            }
          >
            <option value="MARKETING_MANAGER">Marketing Manager</option>
            <option value="APP_MANAGER">App Manager</option>
          </Select>
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
                <EmptyState
                  icon={<Users className="h-5 w-5" />}
                  title={tp("noMembersYet", "No assigned collaborators yet.")}
                  description=""
                />
              ) : (
                appAccess.members.map((member) => (
                  <div
                    key={member.assignmentId}
                    className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
                  >
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-slate-900">
                        {member.name}
                      </p>
                      <Badge variant="info">{member.role}</Badge>
                    </div>
                    <p className="text-slate-500">{member.email}</p>
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
                <EmptyState
                  icon={<Mail className="h-5 w-5" />}
                  title={tp("noPendingInvites", "No pending invites.")}
                  description=""
                />
              ) : (
                appAccess.invites.map((invite) => (
                  <div
                    key={invite.id}
                    className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-slate-900">
                          {invite.email}
                        </p>
                        <div className="mt-1 flex items-center gap-2">
                          <Badge variant="warning">{invite.role}</Badge>
                          <span className="text-xs text-slate-500">
                            {tp("inviteExpires", "Expires")}:{" "}
                            {invite.expiresAt
                              ? new Date(invite.expiresAt).toLocaleDateString()
                              : tp("never", "Never")}
                          </span>
                        </div>
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
      </Card>

      {/* Automation: triggers + workflows, per-app */}
      <Card>
        <CardHeader>
          <CardTitle icon={<Zap className="h-5 w-5 text-blue-600" />}>
            {tp("automation", "Automation")}
          </CardTitle>
        </CardHeader>
        <div className="grid gap-4 md:grid-cols-3">
          <button
            type="button"
            onClick={() => navigate(`/apps/${app.id}/triggers`)}
            className="group flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 text-left transition-all hover:border-blue-200 hover:shadow-md"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
                <Filter className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 group-hover:text-blue-700">
                  {tp("manageTriggers", "Manage Triggers")}
                </h3>
                <p className="text-sm text-slate-500">
                  {tp(
                    "manageTriggersDescription",
                    "Define the events this app can emit.",
                  )}
                </p>
              </div>
            </div>
            <ChevronRight
              className={clsx(
                "h-5 w-5 text-slate-400 transition-colors group-hover:text-blue-600",
                direction === "rtl" && "-scale-x-100",
              )}
            />
          </button>
          <button
            type="button"
            onClick={() => navigate(`/apps/${app.id}/workflows`)}
            className="group flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 text-left transition-all hover:border-blue-200 hover:shadow-md"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-50 text-purple-600">
                <Zap className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 group-hover:text-blue-700">
                  {tp("manageWorkflows", "Manage Workflows")}
                </h3>
                <p className="text-sm text-slate-500">
                  {tp(
                    "manageWorkflowsDescription",
                    "Build notification pipelines on top of triggers.",
                  )}
                </p>
              </div>
            </div>
            <ChevronRight
              className={clsx(
                "h-5 w-5 text-slate-400 transition-colors group-hover:text-blue-600",
                direction === "rtl" && "-scale-x-100",
              )}
            />
          </button>
          <button
            type="button"
            onClick={() => navigate(`/apps/${app.id}/api-keys`)}
            className="group flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 text-left transition-all hover:border-blue-200 hover:shadow-md"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                <Key className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 group-hover:text-blue-700">
                  {tp("manageApiKeys", "Manage API Keys")}
                </h3>
                <p className="text-sm text-slate-500">
                  {tp(
                    "manageApiKeysDescription",
                    "Issue scoped machine keys for backend integrations.",
                  )}
                </p>
              </div>
            </div>
            <ChevronRight
              className={clsx(
                "h-5 w-5 text-slate-400 transition-colors group-hover:text-blue-600",
                direction === "rtl" && "-scale-x-100",
              )}
            />
          </button>
        </div>
      </Card>

      {/* Notification History Link */}
      <Card>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
              <History className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                {tp("notificationHistory", "Notification History")}
              </h3>
              <p className="text-sm text-slate-500">
                {notifications.length > 0
                  ? tp(
                      "recentNotificationsCount",
                      "{{count}} recent notifications",
                      { count: notifications.length },
                    )
                  : tp("noNotificationsYet", "No notifications yet.")}
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => navigate("/history")}
          >
            <History className="h-4 w-4" />
            {tp("viewFullHistory", "View Full History")}
          </Button>
        </div>
      </Card>
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

