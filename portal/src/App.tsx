import { useEffect, useMemo, useState } from "react";
import { Settings, Bell } from "lucide-react";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { LoginPage } from "./components/LoginPage";
import { InitialSetupPage } from "./components/InitialSetupPage";
import { ABTesting } from "./components/ABTesting";
import { Campaigns } from "./components/Campaigns";
import { UsersDevices } from "./components/UsersDevices";
import { WebhookManager } from "./components/WebhookManager";
import { TemplatesManager } from "./components/TemplatesManager";
import { AutomationList } from "./components/AutomationList";
import { SDKGenerator } from "./components/SDKGenerator";
import { WebhookSimulator } from "./components/WebhookSimulator";
import { Button } from "./components/ui/button";
import { AdminAccessManager } from "./components/AdminAccessManager";

// New Architecture Components
import { Sidebar } from "./components/Sidebar";
import { DashboardPage } from "./pages/DashboardPage";
import { CredentialsPage } from "./pages/CredentialsPage";
import { AppDetailPage } from "./pages/AppDetailPage";
import { NotificationHistoryPage } from "./pages/NotificationHistoryPage";
import { SendNotificationForm } from "./components/SendNotificationForm";
import { OnboardingPage } from "./components/OnboardingPage";
import { useAppManager } from "./hooks/useAppManager";
import { useOnboarding } from "./hooks/useOnboarding";
import type { Application } from "./types";
import { apiFetch } from "./lib/api";
import { useConfirmDialog } from "./context/ConfirmDialogContext";
import { LanguageSelector } from "./components/LanguageSelector";
import { useI18n, useScopedTranslation } from "./context/I18nContext";

function AppContent() {
  const { logout, token, canManageCredentials, user } = useAuth();
  const { confirm } = useConfirmDialog();
  const { direction } = useI18n();
  const ta = useScopedTranslation("components", "AppShell");
  const tc = useScopedTranslation("components", "common");
  const forwardArrow = direction === "rtl" ? "←" : "→";
  const backwardArrow = direction === "rtl" ? "→" : "←";

  const [activeTab, setActiveTab] = useState("dashboard");
  const [showCreateAppDialog, setShowCreateAppDialog] = useState(false);
  const [newAppName, setNewAppName] = useState("");
  const [creatingApp, setCreatingApp] = useState(false);

  const {
    apps,
    createApp,
    killApp,
    reviveApp,
    refresh: refetchApps,
  } = useAppManager();
  const onboarding = useOnboarding();

  const [selectedAppForCredentials, setSelectedAppForCredentials] =
    useState<Application | null>(null);
  const [selectedAppForTemplates, setSelectedAppForTemplates] =
    useState<Application | null>(null);
  const [selectedAppForAutomations, setSelectedAppForAutomations] =
    useState<Application | null>(null);
  const [selectedAppForDetail, setSelectedAppForDetail] =
    useState<Application | null>(null);
  const visibleApps = apps;

  const activeTabTitle = useMemo(() => {
    const tabTitleMap: Record<string, string> = {
      onboarding: ta("tabOnboarding", "Getting Started"),
      dashboard: ta("tabDashboard", "Dashboard"),
      send: ta("tabSend", "Send Notification"),
      history: ta("tabHistory", "Notification History"),
      templates: ta("tabTemplates", "Templates"),
      automation: ta("tabAutomation", "Automation"),
      simulator: ta("tabSimulator", "Simulator"),
      devx: ta("tabDevx", "DevX & SDKs"),
      apps: ta("tabApps", "Manage Apps"),
      users: ta("tabUsers", "Users & Devices"),
      campaigns: ta("tabCampaigns", "Campaigns"),
      abtests: ta("tabAbtests", "A/B Testing"),
      credentials: ta("tabCredentials", "Credentials"),
      "admin-access": ta("tabAdminAccess", "Admin Access"),
    };

    return tabTitleMap[activeTab] || activeTab;
  }, [activeTab, ta]);

  // Auto-redirect to onboarding when user hasn't completed setup
  useEffect(() => {
    if (
      !onboarding.isLoading &&
      !onboarding.isOnboarded &&
      user?.role !== "MARKETING_MANAGER"
    ) {
      // If user is on a locked tab, redirect to onboarding
      const allowedTabs = ["apps", "credentials", "onboarding"];
      if (!allowedTabs.includes(activeTab)) {
        setActiveTab("onboarding");
      }
    }
  }, [onboarding.isLoading, onboarding.isOnboarded, activeTab]);

  useEffect(() => {
    if (!selectedAppForTemplates) return;
    const updated = visibleApps.find((a) => a.id === selectedAppForTemplates.id);
    if (!updated) {
      setSelectedAppForTemplates(null);
      return;
    }
    if (
      updated.name !== selectedAppForTemplates.name ||
      updated.isKilled !== selectedAppForTemplates.isKilled
    ) {
      setSelectedAppForTemplates(updated);
    }
  }, [visibleApps, selectedAppForTemplates]);

  useEffect(() => {
    if (!selectedAppForDetail) return;
    const updated = visibleApps.find((a) => a.id === selectedAppForDetail.id);
    if (!updated) {
      setSelectedAppForDetail(null);
      return;
    }
    if (
      updated.name !== selectedAppForDetail.name ||
      updated.isKilled !== selectedAppForDetail.isKilled
    ) {
      setSelectedAppForDetail(updated);
    }
  }, [visibleApps, selectedAppForDetail]);

  useEffect(() => {
    if (!selectedAppForCredentials) return;
    const updated = visibleApps.find((a) => a.id === selectedAppForCredentials.id);
    if (!updated) {
      setSelectedAppForCredentials(null);
      return;
    }
    if (
      updated.name !== selectedAppForCredentials.name ||
      updated.isKilled !== selectedAppForCredentials.isKilled
    ) {
      setSelectedAppForCredentials(updated);
    }
  }, [visibleApps, selectedAppForCredentials]);

  useEffect(() => {
    if (!selectedAppForAutomations) return;
    const updated = visibleApps.find((a) => a.id === selectedAppForAutomations.id);
    if (!updated) {
      setSelectedAppForAutomations(null);
      return;
    }
    if (
      updated.name !== selectedAppForAutomations.name ||
      updated.isKilled !== selectedAppForAutomations.isKilled
    ) {
      setSelectedAppForAutomations(updated);
    }
  }, [visibleApps, selectedAppForAutomations]);

  const handleCreateApp = async () => {
    if (!newAppName.trim()) return;
    setCreatingApp(true);
    try {
      await createApp(newAppName.trim());
      setNewAppName("");
      setShowCreateAppDialog(false);
      // Refresh onboarding status after creating app
      await onboarding.refresh();
    } finally {
      setCreatingApp(false);
    }
  };

  const handleOnboardingCreateApp = async (name: string) => {
    await createApp(name);
    // Refresh onboarding status after creating app
    await onboarding.refresh();
  };

  const handleOnboardingNavigate = (tab: string) => {
    setActiveTab(tab);
    // If navigating to dashboard after onboarding, refresh status
    if (tab === "dashboard") {
      onboarding.refresh();
    }
  };

  const toggleAppStatusFromList = async (app: Application) => {
    const action = app.isKilled ? "activate" : "deactivate";
    const confirmed = await confirm({
      title:
        action === "activate"
          ? ta("confirmActivateAppTitle", "Activate App")
          : ta("confirmDeactivateAppTitle", "Deactivate App"),
      description:
        action === "deactivate"
          ? ta(
            "confirmDeactivateAppDescription",
            "This will cancel all scheduled notifications.",
          )
          : ta(
            "confirmActivateAppDescription",
            "The app will start accepting notifications again.",
          ),
      confirmText:
        action === "activate"
          ? ta("activate", "Activate")
          : ta("deactivate", "Deactivate"),
      destructive: action === "deactivate",
    });
    if (!confirmed) {
      return;
    }

    try {
      if (app.isKilled) {
        await reviveApp(app.id);
      } else {
        await killApp(app.id);
      }
    } catch (error) {
      console.error(`Failed to ${action} app`, error);
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 font-sans text-slate-900">
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        canManageCredentials={canManageCredentials}
        canManageAdminUsers={user?.role === "SUPER_ADMIN"}
        logout={logout}
        userName={user?.name || user?.email}
        userRole={user?.role}
        hasApps={visibleApps.length > 0}
        isOnboarded={onboarding.isOnboarded}
      />

      <main className="relative flex-1 overflow-y-auto scroll-smooth bg-slate-50/50 p-8 lg:p-12">
        <header className="mb-12 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-3xl font-black capitalize tracking-tight text-slate-900">
              {activeTabTitle}
            </h2>
            <p className="mt-1 font-medium text-slate-500">
              {activeTab === "onboarding"
                ? ta(
                  "headerSubtitleOnboarding",
                  "Complete the setup to unlock your notification platform.",
                )
                : ta(
                  "headerSubtitleDefault",
                  "Manage your notification infrastructure with intelligence.",
                )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <LanguageSelector />
            <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 shadow-sm">
              <div className="h-2 w-2 animate-pulse rounded-full bg-green-500" />
              <span className="text-xs font-bold uppercase tracking-widest text-slate-600">
                {ta("systemOnline", "System Online")}
              </span>
            </div>
          </div>
        </header>

        {/* Onboarding page for new users */}
        {activeTab === "onboarding" && (
          <OnboardingPage
            hasApps={onboarding.hasApps}
            hasCredentials={onboarding.hasCredentials}
            apps={visibleApps}
            canManageCredentials={canManageCredentials}
            onNavigate={handleOnboardingNavigate}
            onCreateApp={handleOnboardingCreateApp}
          />
        )}

        {activeTab === "dashboard" && <DashboardPage setActiveTab={setActiveTab} />}

        {activeTab === "send" && <SendNotificationForm apps={visibleApps} />}
        {activeTab === "history" && (
          <NotificationHistoryPage apps={visibleApps} token={token} />
        )}

        {activeTab === "templates" && (
          <div className="space-y-6">
            {!selectedAppForTemplates ? (
              <div className="space-y-4">
                <p className="text-gray-500">
                  {ta(
                    "selectAppTemplates",
                    "Select an app to manage its localized templates:",
                  )}
                </p>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {visibleApps.length === 0 ? (
                    <div className="col-span-full rounded-xl border bg-white p-6 text-center text-gray-400">
                      <Settings className="mx-auto mb-4 h-12 w-12 opacity-50" />
                      <p>
                        {ta(
                          "noAppsRegisteredCreateFirst",
                          "No apps registered. Create an app first!",
                        )}
                      </p>
                    </div>
                  ) : (
                    visibleApps.map((app: Application) => (
                      <button
                        key={app.id}
                        onClick={() => setSelectedAppForTemplates(app)}
                        className="rounded-xl border bg-white p-6 text-start transition-all hover:border-blue-500 hover:shadow-md"
                      >
                        <h4 className="text-lg font-semibold">{app.name}</h4>
                        <p className="mt-1 font-mono text-xs text-gray-400">{app.id}</p>
                        <p className="mt-3 text-sm text-blue-600">
                          {ta("manageTemplates", "Manage Templates")} {forwardArrow}
                        </p>
                      </button>
                    ))
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedAppForTemplates(null)}
                  className="mb-2"
                >
                  {backwardArrow} {ta("backToAppSelection", "Back to App Selection")}
                </Button>
                <TemplatesManager appId={selectedAppForTemplates.id} />
              </div>
            )}
          </div>
        )}

        {activeTab === "automation" && (
          <div className="space-y-6">
            {!visibleApps.length ? (
              <div className="rounded-xl border bg-white p-12 text-center text-slate-400">
                <p>No apps registered. Create an app first to build automations.</p>
              </div>
            ) : !selectedAppForAutomations ? (
              <div className="space-y-4">
                <p className="text-gray-500">
                  Select an app to manage triggers and automation workflows:
                </p>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {visibleApps.map((app: Application) => (
                    <button
                      key={app.id}
                      onClick={() => setSelectedAppForAutomations(app)}
                      className="rounded-xl border bg-white p-6 text-start transition-all hover:border-blue-500 hover:shadow-md"
                    >
                      <h4 className="text-lg font-semibold">{app.name}</h4>
                      <p className="mt-1 font-mono text-xs text-gray-400">{app.id}</p>
                      <p className="mt-3 text-sm text-blue-600">
                        Manage Automation {forwardArrow}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedAppForAutomations(null)}
                  className="mb-2"
                >
                  {backwardArrow} Back to App Selection
                </Button>
                <AutomationList
                  appId={selectedAppForAutomations.id}
                  appName={selectedAppForAutomations.name}
                />
              </div>
            )}
          </div>
        )}
        {activeTab === "simulator" && <WebhookSimulator />}

        {activeTab === "devx" && (
          <div className="space-y-8">
            <SDKGenerator />
            <div className="rounded-[2.5rem] border border-gray-100 bg-white p-8 shadow-sm">
              <div className="mb-8 flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-bold text-gray-900">
                    {ta("webhookManagementTitle", "Webhook Management")}
                  </h3>
                  <p className="mt-1 text-sm text-gray-500">
                    {ta(
                      "webhookManagementSubtitle",
                      "Receive real-time delivery and click insights",
                    )}
                  </p>
                </div>
              </div>
              <WebhookManager
                appId={visibleApps[0]?.id || ""}
                appName={visibleApps[0]?.name || ""}
                token={token || ""}
              />
            </div>
          </div>
        )}

        {activeTab === "apps" && (
          <div className="space-y-6">
            {!selectedAppForDetail ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <h3 className="text-xl font-bold text-slate-900">
                      {ta("notificationsWorkspaces", "Notifications Workspaces")}
                    </h3>
                    <p className="text-gray-500">
                      {ta(
                        "manageAppsDescription",
                        "Manage your notification apps and services.",
                      )}
                    </p>
                  </div>
                  <Button size="sm" onClick={() => setShowCreateAppDialog(true)}>
                    <Settings className="me-2 h-4 w-4" />
                    {ta("creatingApp", "Creating App")}
                  </Button>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {visibleApps.length === 0 ? (
                    <div className="col-span-full rounded-xl border bg-white p-12 text-center text-gray-400">
                      <Settings className="mx-auto mb-4 h-12 w-12 opacity-50" />
                      <p className="text-lg font-medium text-slate-900">
                        {ta("noAppsRegistered", "No apps registered")}
                      </p>
                      <p className="mb-6">
                        {ta("createFirstApp", "Create your first app to get started!")}
                      </p>
                      <Button onClick={() => setShowCreateAppDialog(true)}>
                        {ta("createApp", "Create App")}
                      </Button>
                    </div>
                  ) : (
                    visibleApps.map((app: Application) => (
                      <div
                        key={app.id}
                        className="group relative overflow-hidden rounded-xl border bg-white p-6 text-start transition-all hover:border-blue-500 hover:shadow-md"
                      >
                        <div className="absolute top-0 end-0 p-4">
                          <span
                            className={`block h-2 w-2 rounded-full ${app.isKilled ? "bg-red-500" : "bg-green-500"
                              }`}
                          />
                        </div>
                        <div className="flex items-center gap-3">
                          <AppAvatar app={app} className="h-12 w-12 rounded-2xl" />
                          <div className="min-w-0">
                            <h4 className="truncate text-lg font-semibold transition-colors group-hover:text-blue-600">
                              {app.name}
                            </h4>
                            {app.notificationIconUrl ? (
                              <p className="text-xs text-slate-500">
                                {ta("notificationIconConfigured", "Notification icon configured")}
                              </p>
                            ) : null}
                          </div>
                        </div>
                        <p className="mb-4 mt-1 truncate font-mono text-xs text-slate-400">
                          {app.id}
                        </p>
                        <div className="mt-4 flex items-center justify-between gap-2">
                          <button
                            onClick={() => setSelectedAppForDetail(app)}
                            className="flex items-center text-sm font-medium text-slate-500 transition-colors hover:text-blue-600"
                          >
                            {ta("viewDetailsStats", "View details & stats")}
                            <span className="ms-1">{forwardArrow}</span>
                          </button>
                          <Button
                            size="sm"
                            variant="outline"
                            className={
                              app.isKilled
                                ? "text-green-600 hover:text-green-700"
                                : "text-amber-600 hover:text-amber-700"
                            }
                            onClick={() => toggleAppStatusFromList(app)}
                          >
                            {app.isKilled
                              ? ta("activate", "Activate")
                              : ta("deactivate", "Deactivate")}
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ) : (
              <AppDetailPage
                app={selectedAppForDetail}
                token={token}
                onBack={() => setSelectedAppForDetail(null)}
                onUpdate={async (updated) => {
                  if (updated) {
                    setSelectedAppForDetail(updated);
                  }
                  await refetchApps();
                }}
              />
            )}
          </div>
        )}

        {activeTab === "users" && <UsersDevices apps={visibleApps} token={token} />}
        {activeTab === "campaigns" && <Campaigns apps={visibleApps} token={token} />}
        {activeTab === "abtests" && <ABTesting apps={visibleApps} token={token} />}

        {activeTab === "credentials" && canManageCredentials && (
          <div className="space-y-6">
            {!selectedAppForCredentials ? (
              <div className="space-y-4">
                <p className="text-gray-500">
                  {ta(
                    "selectAppCredentials",
                    "Select an app to manage its push provider credentials:",
                  )}
                </p>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {visibleApps.length === 0 ? (
                    <div className="col-span-full rounded-xl border bg-white p-6 text-center text-gray-400">
                      <Settings className="mx-auto mb-4 h-12 w-12 opacity-50" />
                      <p>
                        {ta(
                          "noAppsRegisteredCreateFirst",
                          "No apps registered. Create an app first!",
                        )}
                      </p>
                    </div>
                  ) : (
                    visibleApps.map((app: Application) => (
                      <button
                        key={app.id}
                        onClick={() => setSelectedAppForCredentials(app)}
                        className="rounded-xl border bg-white p-6 text-start transition-all hover:border-blue-500 hover:shadow-md"
                      >
                        <div className="flex items-center gap-3">
                          <AppAvatar app={app} className="h-10 w-10 rounded-2xl" />
                          <h4 className="text-lg font-semibold">{app.name}</h4>
                        </div>
                        <p className="mt-1 font-mono text-xs text-gray-400">{app.id}</p>
                        <p className="mt-3 flex items-center gap-1 text-sm text-blue-600">
                          {ta("manageCredentials", "Manage Credentials")} {forwardArrow}
                        </p>
                      </button>
                    ))
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <button
                  onClick={() => setSelectedAppForCredentials(null)}
                  className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800"
                >
                  {backwardArrow} {ta("backToApps", "Back to Apps")}
                </button>
                <CredentialsPage
                  appId={selectedAppForCredentials.id}
                  appName={selectedAppForCredentials.name}
                  onCredentialChange={() => onboarding.refresh()}
                />
              </div>
            )}
          </div>
        )}

        {activeTab === "admin-access" && user?.role === "SUPER_ADMIN" && (
          <AdminAccessManager />
        )}

        {showCreateAppDialog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-md rounded-2xl border bg-white shadow-2xl">
              <div className="border-b border-slate-100 p-6">
                <h3 className="text-lg font-semibold text-slate-900">
                  {ta("createAppModalTitle", "Create App")}
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  {ta(
                    "createAppModalDescription",
                    "Create a new application workspace for notifications.",
                  )}
                </p>
              </div>

              <div className="space-y-3 p-6">
                <label className="block text-sm font-medium text-slate-700">
                  {ta("appNameLabel", "App Name")}
                </label>
                <input
                  className="w-full rounded-lg border p-2.5 text-sm"
                  value={newAppName}
                  onChange={(e) => setNewAppName(e.target.value)}
                  placeholder={ta("appNamePlaceholder", "e.g. Cardy")}
                  autoFocus
                />
              </div>

              <div className="flex justify-end gap-2 border-t bg-slate-50 p-6">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowCreateAppDialog(false);
                    setNewAppName("");
                  }}
                >
                  {tc("cancel", "Cancel")}
                </Button>
                <Button
                  onClick={handleCreateApp}
                  disabled={creatingApp || !newAppName.trim()}
                >
                  {creatingApp
                    ? ta("createAppLoading", "Creating...")
                    : ta("createApp", "Create App")}
                </Button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <AuthenticatedApp />
    </AuthProvider>
  );
}

function AuthenticatedApp() {
  const { isAuthenticated, isLoading, login } = useAuth();
  const tc = useScopedTranslation("components", "common");

  const [setupStatusLoading, setSetupStatusLoading] = useState(true);
  const [setupRequired, setSetupRequired] = useState(false);
  const [setupTokenRequired, setSetupTokenRequired] = useState(false);

  useEffect(() => {
    if (isAuthenticated) {
      setSetupStatusLoading(false);
      return;
    }

    let mounted = true;

    const loadSetupStatus = async () => {
      try {
        const status = await apiFetch<{
          setupRequired: boolean;
          setupTokenRequired: boolean;
        }>("/admin/setup-status");

        if (!mounted) return;
        setSetupRequired(status.setupRequired);
        setSetupTokenRequired(status.setupTokenRequired);
      } catch {
        // If status endpoint fails, default to login page.
        if (!mounted) return;
        setSetupRequired(false);
        setSetupTokenRequired(false);
      } finally {
        if (mounted) setSetupStatusLoading(false);
      }
    };

    void loadSetupStatus();

    return () => {
      mounted = false;
    };
  }, [isAuthenticated]);

  const handleSetupComplete = async (credentials: {
    email: string;
    password: string;
  }) => {
    setSetupRequired(false);
    await login(credentials.email, credentials.password);
  };

  if (isLoading || setupStatusLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 animate-pulse items-center justify-center rounded-xl bg-linear-to-br from-blue-600 to-purple-600">
            <Bell className="h-6 w-6 text-white" />
          </div>
          <p className="text-gray-500">{tc("loading", "Loading...")}</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated && setupRequired) {
    return (
      <InitialSetupPage
        setupTokenRequired={setupTokenRequired}
        onSetupComplete={handleSetupComplete}
      />
    );
  }

  if (!isAuthenticated) return <LoginPage />;
  return <AppContent />;
}

function AppAvatar({
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
        className={`${className || ""} object-cover shadow-sm`}
      />
    );
  }

  return (
    <div
      className={`${className || ""} flex items-center justify-center bg-linear-to-br from-slate-900 via-slate-700 to-slate-500 text-sm font-black uppercase text-white shadow-sm`}
    >
      {app.name.slice(0, 1)}
    </div>
  );
}

export default App;
