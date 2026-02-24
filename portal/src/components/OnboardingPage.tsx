import { useState } from "react";
import {
  Rocket,
  AppWindow,
  KeyRound,
  CheckCircle2,
  ArrowRight,
  Sparkles,
  ChevronRight,
  Settings,
  Shield,
} from "lucide-react";
import { Button } from "./ui/button";
import type { Application } from "../types";
import { useI18n, useScopedTranslation } from "../context/I18nContext";

interface OnboardingPageProps {
  hasApps: boolean;
  hasCredentials: boolean;
  apps: Application[];
  canManageCredentials: boolean;
  onNavigate: (tab: string) => void;
  onCreateApp: (name: string) => Promise<void>;
}

export function OnboardingPage({
  hasApps,
  hasCredentials,
  apps,
  canManageCredentials,
  onNavigate,
  onCreateApp,
}: OnboardingPageProps) {
  const { direction } = useI18n();
  const to = useScopedTranslation("components", "OnboardingPage");
  const isRtl = direction === "rtl";

  const [newAppName, setNewAppName] = useState("");
  const [creating, setCreating] = useState(false);

  const currentStep = !hasApps ? 1 : !hasCredentials ? 2 : 3;

  const handleCreateApp = async () => {
    if (!newAppName.trim()) return;
    setCreating(true);
    try {
      await onCreateApp(newAppName.trim());
      setNewAppName("");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="flex min-h-full flex-col items-center justify-center px-4 py-12">
      {/* Hero */}
      <div className="mb-12 max-w-lg text-center">
        <div className="relative mb-6 inline-flex">
          <div className="flex h-20 w-20 animate-pulse items-center justify-center rounded-3xl bg-gradient-to-br from-blue-600 via-purple-600 to-indigo-600 shadow-2xl shadow-blue-300/40">
            <Rocket className="h-10 w-10 text-white" />
          </div>
          <div className="absolute -top-2 -end-2 flex h-8 w-8 animate-bounce items-center justify-center rounded-full bg-amber-400 shadow-lg">
            <Sparkles className="h-4 w-4 text-white" />
          </div>
        </div>
        <h1 className="mb-3 text-4xl font-black tracking-tight text-slate-900">
          {to("welcomeTitle", "Welcome to NotifyX")}
        </h1>
        <p className="text-lg font-medium leading-relaxed text-slate-500">
          {to(
            "welcomeDescription",
            "Let's get you set up in just a few minutes. Create your first app and configure your push credentials to unlock the full power of NotifyX.",
          )}
        </p>
      </div>

      {/* Progress Steps */}
      <div className="mb-12 flex w-full max-w-md items-center gap-0">
        <StepIndicator
          label={to("stepCreateApp", "Create App")}
          icon={<AppWindow size={18} />}
          status={currentStep > 1 ? "done" : currentStep === 1 ? "active" : "upcoming"}
        />
        <div
          className={`mx-1 h-1 flex-1 rounded-full transition-colors duration-500 ${
            currentStep > 1
              ? "bg-gradient-to-r from-green-400 to-green-500"
              : "bg-slate-200"
          }`}
        />
        <StepIndicator
          label={to("stepCredentials", "Credentials")}
          icon={<KeyRound size={18} />}
          status={currentStep > 2 ? "done" : currentStep === 2 ? "active" : "upcoming"}
        />
        <div
          className={`mx-1 h-1 flex-1 rounded-full transition-colors duration-500 ${
            currentStep > 2
              ? "bg-gradient-to-r from-green-400 to-green-500"
              : "bg-slate-200"
          }`}
        />
        <StepIndicator
          label={to("stepReady", "Ready!")}
          icon={<Rocket size={18} />}
          status={currentStep >= 3 ? "done" : "upcoming"}
        />
      </div>

      {/* Active Step Card */}
      <div className="w-full max-w-xl">
        {currentStep === 1 && (
          <StepCard
            stepLabel={to("stepLabel", "Step {{number}}", { number: 1 })}
            title={to("createFirstAppTitle", "Create Your First App")}
            description={to(
              "createFirstAppDescription",
              "An app represents your project. Notifications, credentials, and templates are all scoped to an app.",
            )}
            icon={<AppWindow className="h-8 w-8 text-blue-500" />}
            accentColor="blue"
          >
            <div className="space-y-4">
              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">
                  {to("appName", "App Name")}
                </label>
                <input
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-medium placeholder:text-slate-400 transition-all focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={newAppName}
                  onChange={(e) => setNewAppName(e.target.value)}
                  placeholder={to("appNamePlaceholder", "e.g. MyApp, Cardy, ShopNow")}
                  autoFocus
                  onKeyDown={(e) => e.key === "Enter" && handleCreateApp()}
                />
              </div>
              <Button
                onClick={handleCreateApp}
                disabled={creating || !newAppName.trim()}
                className="h-12 w-full rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 text-sm font-bold text-white shadow-lg shadow-blue-200/50 transition-all hover:from-blue-700 hover:to-blue-800"
              >
                {creating ? (
                  <div className="flex items-center gap-2">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    {to("creating", "Creating...")}
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    {to("createApp", "Create App")}{" "}
                    <ArrowRight size={16} className={isRtl ? "-scale-x-100" : undefined} />
                  </div>
                )}
              </Button>
            </div>
          </StepCard>
        )}

        {currentStep === 2 && (
          <StepCard
            stepLabel={to("stepLabel", "Step {{number}}", { number: 2 })}
            title={to("configureCredentialsTitle", "Configure Push Credentials")}
            description={to(
              "configureCredentialsDescription",
              "Connect your push notification provider (FCM, APNS, HMS) by uploading your credentials. This enables NotifyX to deliver notifications on your behalf.",
            )}
            icon={<KeyRound className="h-8 w-8 text-purple-500" />}
            accentColor="purple"
          >
            <div className="space-y-4">
              {/* Show created app badge */}
              <div className="flex items-center gap-3 rounded-xl border border-green-100 bg-green-50 p-4">
                <CheckCircle2 className="h-5 w-5 shrink-0 text-green-500" />
                <div>
                  <p className="text-sm font-semibold text-green-800">
                    {to("appCreatedSuccess", "App Created Successfully")}
                  </p>
                  <p className="text-xs text-green-600">
                    {to("appReadyCredentials", "{{appName}} is ready — now let's add credentials.", {
                      appName: apps[0]?.name || "Your app",
                    })}
                  </p>
                </div>
              </div>

              {canManageCredentials ? (
                <Button
                  onClick={() => onNavigate("credentials")}
                  className="h-12 w-full rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 text-sm font-bold text-white shadow-lg shadow-purple-200/50 transition-all hover:from-purple-700 hover:to-indigo-700"
                >
                  <div className="flex items-center gap-2">
                    <Shield size={16} />
                    {to("configureCredentials", "Configure Credentials")}
                    <ChevronRight
                      size={16}
                      className={isRtl ? "-scale-x-100" : undefined}
                    />
                  </div>
                </Button>
              ) : (
                <div className="rounded-xl border border-amber-100 bg-amber-50 p-4 text-center">
                  <p className="text-sm font-medium text-amber-800">
                    {to(
                      "contactSuperAdmin",
                      "Contact your Super Admin to configure push credentials for your app.",
                    )}
                  </p>
                </div>
              )}
            </div>
          </StepCard>
        )}

        {currentStep >= 3 && (
          <StepCard
            stepLabel={to("stepLabel", "Step {{number}}", { number: 3 })}
            title={to("allSetTitle", "You're All Set!")}
            description={to(
              "allSetDescription",
              "Your app is created and credentials are configured. The full NotifyX dashboard is now unlocked. Start sending notifications!",
            )}
            icon={<CheckCircle2 className="h-8 w-8 text-green-500" />}
            accentColor="green"
          >
            <Button
              onClick={() => onNavigate("dashboard")}
              className="h-12 w-full rounded-xl bg-gradient-to-r from-green-600 to-emerald-600 text-sm font-bold text-white shadow-lg shadow-green-200/50 transition-all hover:from-green-700 hover:to-emerald-700"
            >
              <div className="flex items-center gap-2">
                {to("goToDashboard", "Go to Dashboard")}{" "}
                <ArrowRight size={16} className={isRtl ? "-scale-x-100" : undefined} />
              </div>
            </Button>
          </StepCard>
        )}

        {/* Helpful tips */}
        <div className="mt-8 grid grid-cols-2 gap-4">
          <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
            <Settings className="mb-2 h-5 w-5 text-slate-400" />
            <p className="mb-1 text-xs font-bold uppercase tracking-wider text-slate-600">
              {to("whyApps", "Why Apps?")}
            </p>
            <p className="text-xs leading-relaxed text-slate-500">
              {to(
                "whyAppsDescription",
                "Apps isolate your notification environments — one per project or service.",
              )}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
            <Shield className="mb-2 h-5 w-5 text-slate-400" />
            <p className="mb-1 text-xs font-bold uppercase tracking-wider text-slate-600">
              {to("whyCredentials", "Why Credentials?")}
            </p>
            <p className="text-xs leading-relaxed text-slate-500">
              {to(
                "whyCredentialsDescription",
                "NotifyX needs your provider keys (FCM, APNS) to deliver push notifications securely.",
              )}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// Sub-components

function StepIndicator({
  label,
  icon,
  status,
}: {
  label: string;
  icon: React.ReactNode;
  status: "done" | "active" | "upcoming";
}) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div
        className={`
          flex h-10 w-10 items-center justify-center rounded-full transition-all duration-500
          ${
            status === "done"
              ? "scale-100 bg-green-500 text-white shadow-lg shadow-green-200/50"
              : status === "active"
                ? "scale-110 bg-gradient-to-br from-blue-600 to-purple-600 text-white shadow-lg shadow-blue-200/50 ring-4 ring-blue-100"
                : "bg-slate-100 text-slate-400"
          }
        `}
      >
        {status === "done" ? <CheckCircle2 size={18} /> : icon}
      </div>
      <span
        className={`whitespace-nowrap text-[10px] font-bold uppercase tracking-wider ${
          status === "active"
            ? "text-blue-600"
            : status === "done"
              ? "text-green-600"
              : "text-slate-400"
        }`}
      >
        {label}
      </span>
    </div>
  );
}

function StepCard({
  stepLabel,
  title,
  description,
  icon,
  accentColor,
  children,
}: {
  stepLabel: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  accentColor: "blue" | "purple" | "green";
  children: React.ReactNode;
}) {
  const borderColor = {
    blue: "border-blue-100",
    purple: "border-purple-100",
    green: "border-green-100",
  }[accentColor];

  const bgGlow = {
    blue: "shadow-blue-100/50",
    purple: "shadow-purple-100/50",
    green: "shadow-green-100/50",
  }[accentColor];

  return (
    <div
      className={`animate-in fade-in slide-in-from-bottom-4 rounded-3xl border-2 ${borderColor} bg-white p-8 shadow-xl ${bgGlow} transition-all duration-500`}
    >
      <div className="mb-6 flex items-start gap-4">
        <div className="mt-0.5 shrink-0">{icon}</div>
        <div>
          <div className="mb-1 flex items-center gap-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
              {stepLabel}
            </span>
          </div>
          <h3 className="text-xl font-bold text-slate-900">{title}</h3>
          <p className="mt-1 text-sm leading-relaxed text-slate-500">{description}</p>
        </div>
      </div>
      {children}
    </div>
  );
}
