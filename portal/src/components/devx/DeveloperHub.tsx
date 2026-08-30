import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronRight,
  Copy,
  ExternalLink,
  Key,
  KeyRound,
  Rocket,
  ShieldCheck,
  Terminal,
} from "lucide-react";
import { clsx } from "clsx";
import { Link } from "react-router-dom";
import { useAppContext } from "../../context/AppContext";
import { useAuth } from "../../context/AuthContext";
import { credentialService } from "../../services/credentialService";
import { apiKeyService, type AppApiKey } from "../../services/apiKeyService";
import {
  AppleIcon,
  FirebaseIcon,
  FlutterIcon,
  GitHubIcon,
  HuaweiIcon,
  ReactIcon,
  WebPushIcon,
} from "../ui/BrandIcons";
import { PROVIDER_GUIDES, type ProviderGuide } from "./ProviderSetupGuides";
import {
  API_ENDPOINTS,
  REPO_URL,
  SDK_TREE,
  buildIntegrations,
  type PlatformIntegration,
} from "./snippets";

type HubTab = "start" | "sdks" | "providers" | "api";

/** Resolve the API origin the portal itself is talking to. */
function apiBaseUrl(): string {
  const configured = (import.meta.env.VITE_API_URL as string) || "http://localhost:3000";
  return configured.replace(/\/api\/v1\/?$/, "").replace(/\/$/, "");
}

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      }}
      className={clsx(
        "inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium transition-all",
        copied
          ? "bg-emerald-500/20 text-emerald-300"
          : "bg-white/10 text-slate-300 hover:bg-white/20 hover:text-white",
      )}
    >
      {copied ? <Check size={12} /> : <Copy size={12} />}
      {copied ? "Copied" : label}
    </button>
  );
}

function CodeBlock({
  code,
  language,
  filename,
}: {
  code: string;
  language: string;
  filename?: string;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
      <div className="flex items-center justify-between border-b border-slate-800 px-4 py-2">
        <span className="font-mono text-[11px] uppercase tracking-wider text-slate-500">
          {filename || language}
        </span>
        <CopyButton text={code} />
      </div>
      <pre className="overflow-x-auto p-4 font-mono text-[12.5px] leading-relaxed text-slate-300">
        {code}
      </pre>
    </div>
  );
}

/* ─────────────────────────  Quickstart  ───────────────────────── */

const PLATFORM_ICONS: Record<PlatformIntegration["key"], React.ReactNode> = {
  web: <WebPushIcon size={20} />,
  "react-native": <ReactIcon size={20} />,
  flutter: <FlutterIcon size={20} />,
  server: <Terminal size={20} className="text-slate-600" />,
};

function Quickstart({
  integrations,
  appId,
}: {
  integrations: PlatformIntegration[];
  appId: string;
}) {
  const [platform, setPlatform] = useState<PlatformIntegration["key"]>("web");
  const active = integrations.find((i) => i.key === platform) || integrations[0]!;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {integrations.map((integration) => (
          <button
            key={integration.key}
            type="button"
            onClick={() => setPlatform(integration.key)}
            className={clsx(
              "rounded-xl border p-4 text-start transition-all",
              platform === integration.key
                ? "border-blue-300 bg-blue-50/60 shadow-sm ring-1 ring-blue-200"
                : "border-slate-200 hover:border-slate-300 hover:bg-slate-50",
            )}
          >
            <div className="mb-2 flex h-8 w-8 items-center justify-center">
              {PLATFORM_ICONS[integration.key]}
            </div>
            <p className="text-sm font-semibold text-slate-900">{integration.label}</p>
            <p className="mt-0.5 text-[11px] leading-snug text-slate-500">
              {integration.tagline}
            </p>
          </button>
        ))}
      </div>

      {active.sourcePath && (
        <a
          href={active.sourceHref}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50"
        >
          <GitHubIcon size={14} />
          {active.sourcePath}
          <ArrowUpRight size={12} className="text-slate-400" />
        </a>
      )}

      <ol className="space-y-5">
        {active.steps.map((step, i) => (
          <li key={step.title} className="relative ps-10">
            <span className="absolute start-0 top-0 flex h-7 w-7 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">
              {i + 1}
            </span>
            <h5 className="pt-1 text-sm font-bold text-slate-900">{step.title}</h5>
            {step.description && (
              <p className="mb-3 mt-1 text-sm leading-relaxed text-slate-500">
                {step.description}
              </p>
            )}
            <div className={step.description ? "" : "mt-3"}>
              <CodeBlock
                code={step.code}
                language={step.language}
                filename={step.filename}
              />
            </div>
          </li>
        ))}
      </ol>

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          This app
        </p>
        <div className="mt-2 flex items-center gap-2">
          <code className="rounded bg-white px-2 py-1 font-mono text-xs text-slate-700">
            {appId || "no app selected"}
          </code>
          {appId && (
            <button
              type="button"
              onClick={() => navigator.clipboard.writeText(appId)}
              className="rounded-lg bg-slate-200 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-300"
            >
              Copy app ID
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────  SDK catalogue  ───────────────────────── */

const SDK_CARDS = [
  {
    name: "Web SDK",
    path: "sdks/web",
    icon: <WebPushIcon size={22} />,
    files: ["notifyx-web-sdk.js", "notifyx-sw.js"],
    blurb:
      "Browser SDK: permission prompt, service worker registration, Push API subscription, then user + device registration against NotifyX.",
    example: "sdks/examples/web",
  },
  {
    name: "React Native SDK",
    path: "sdks/react-native",
    icon: <ReactIcon size={22} />,
    files: ["src/NotifyX.ts", "src/types.ts"],
    blurb:
      "TypeScript client with a persisted, client-managed device id so token rotation updates one device record instead of fragmenting history.",
    example: "sdks/examples/react_native_app",
  },
  {
    name: "Flutter SDK",
    path: "sdks/flutter",
    icon: <FlutterIcon size={22} />,
    files: ["lib/notifyx.dart"],
    blurb:
      "Dart client covering iOS (APNs), Android (FCM) and Huawei (HMS), with the same CTA resolution logic as React Native.",
    example: "sdks/examples/flutter_app",
  },
];

function SdkCatalogue() {
  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-slate-900 to-slate-800 p-5 text-white">
        <div className="flex items-start gap-3">
          <GitHubIcon size={22} className="mt-0.5 shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-bold">Everything ships from this repository</p>
            <p className="mt-1 text-sm text-slate-300">
              There is no npm or pub.dev package to install — the SDKs are source you
              vendor or reference by git path. That keeps the client and the API in
              lockstep on one commit.
            </p>
            <a
              href={SDK_TREE}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold hover:bg-white/20"
            >
              Browse sdks/ <ExternalLink size={12} />
            </a>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {SDK_CARDS.map((sdk) => (
          <div
            key={sdk.path}
            className="flex flex-col rounded-xl border border-slate-200 bg-white p-5 transition-shadow hover:shadow-md"
          >
            <div className="mb-3 flex items-center gap-2.5">
              {sdk.icon}
              <h5 className="text-sm font-bold text-slate-900">{sdk.name}</h5>
            </div>
            <p className="mb-4 flex-1 text-sm leading-relaxed text-slate-500">
              {sdk.blurb}
            </p>
            <div className="mb-4 space-y-1">
              {sdk.files.map((f) => (
                <code
                  key={f}
                  className="block truncate rounded bg-slate-50 px-2 py-1 font-mono text-[11px] text-slate-600"
                >
                  {f}
                </code>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <a
                href={`${REPO_URL}/tree/main/${sdk.path}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                <GitHubIcon size={12} /> Source
              </a>
              <a
                href={`${REPO_URL}/tree/main/${sdk.example}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Example app <ArrowUpRight size={12} />
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────  Provider credential guides  ───────────────────── */

const GUIDE_ICONS: Record<ProviderGuide["key"], React.ReactNode> = {
  apns: <AppleIcon size={22} />,
  fcm: <FirebaseIcon size={22} />,
  web: <WebPushIcon size={22} />,
  hms: <HuaweiIcon size={22} />,
};

function ProviderGuides({
  configured,
}: {
  configured: Record<string, boolean>;
}) {
  const [open, setOpen] = useState<ProviderGuide["key"]>("apns");

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">
        Each provider issues its own credentials from its own console. These are the
        exact values NotifyX needs and where to find them.
      </p>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {PROVIDER_GUIDES.map((guide) => (
          <button
            key={guide.key}
            type="button"
            onClick={() => setOpen(guide.key)}
            className={clsx(
              "relative rounded-xl border p-4 text-start transition-all",
              open === guide.key
                ? "border-blue-300 bg-blue-50/60 ring-1 ring-blue-200"
                : "border-slate-200 hover:border-slate-300 hover:bg-slate-50",
            )}
          >
            {configured[guide.key] && (
              <span
                className="absolute end-3 top-3 text-emerald-500"
                title="Credential configured for this app"
              >
                <CheckCircle2 size={15} />
              </span>
            )}
            <div className="mb-2">{GUIDE_ICONS[guide.key]}</div>
            <p className="text-sm font-semibold text-slate-900">
              {guide.key.toUpperCase()}
            </p>
            <p className="mt-0.5 text-[11px] leading-snug text-slate-500">
              {guide.platforms.join(" · ")}
            </p>
          </button>
        ))}
      </div>

      {PROVIDER_GUIDES.filter((g) => g.key === open).map((guide) => (
        <div key={guide.key} className="rounded-xl border border-slate-200 bg-white p-6">
          <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              {GUIDE_ICONS[guide.key]}
              <div>
                <h5 className="text-base font-bold text-slate-900">{guide.name}</h5>
                <p className="text-sm text-slate-500">{guide.subtitle}</p>
              </div>
            </div>
            <a
              href={guide.console.href}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Open console <ExternalLink size={12} />
            </a>
          </div>

          <ol className="mb-6 space-y-4">
            {guide.steps.map((step, i) => (
              <li key={step.title} className="relative ps-9">
                <span className="absolute start-0 top-0.5 flex h-6 w-6 items-center justify-center rounded-full border border-slate-300 text-[11px] font-bold text-slate-600">
                  {i + 1}
                </span>
                <p className="text-sm font-semibold text-slate-900">
                  {step.title}
                  {step.href && (
                    <a
                      href={step.href}
                      target="_blank"
                      rel="noreferrer"
                      className="ms-1.5 inline-flex text-blue-600 hover:text-blue-700"
                    >
                      <ExternalLink size={11} />
                    </a>
                  )}
                </p>
                <p className="mt-0.5 text-sm leading-relaxed text-slate-500">
                  {step.detail}
                </p>
              </li>
            ))}
          </ol>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                What you end up pasting into NotifyX
              </p>
              <div className="overflow-hidden rounded-lg border border-slate-200">
                {guide.fields.map((field) => (
                  <div
                    key={field.key}
                    className="flex items-baseline gap-3 border-b border-slate-100 px-3 py-2 last:border-0"
                  >
                    <code className="shrink-0 font-mono text-[11px] font-semibold text-slate-800">
                      {field.label}
                    </code>
                    <span className="text-[11px] leading-snug text-slate-500">
                      {field.from}
                    </span>
                  </div>
                ))}
              </div>
              <Link
                to="/credentials"
                className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700"
              >
                Go to Credentials <ChevronRight size={13} />
              </Link>
            </div>

            <div>
              <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-amber-600">
                <AlertTriangle size={13} /> Things that bite
              </p>
              <ul className="space-y-2">
                {guide.gotchas.map((g) => (
                  <li
                    key={g}
                    className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-[12.5px] leading-relaxed text-amber-900"
                  >
                    {g}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─────────────────────────  API reference  ───────────────────────── */

const METHOD_STYLES: Record<string, string> = {
  GET: "bg-sky-100 text-sky-700",
  POST: "bg-emerald-100 text-emerald-700",
  PUT: "bg-amber-100 text-amber-700",
  PATCH: "bg-amber-100 text-amber-700",
  DELETE: "bg-rose-100 text-rose-700",
};

function ApiReference({
  appId,
  keys,
  keysLoading,
}: {
  appId: string;
  keys: AppApiKey[];
  keysLoading: boolean;
}) {
  const activeKeys = keys.filter((k) => k.isActive);

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-5 py-4">
          <h5 className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <KeyRound size={15} className="text-slate-500" />
            Authentication
          </h5>
          <p className="mt-1 text-sm text-slate-500">
            Machine endpoints authenticate with an app-scoped key in the{" "}
            <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-xs">
              X-API-Key
            </code>{" "}
            header. A key only works for the app it was minted for.
          </p>
        </div>
        <div className="px-5 py-4">
          {keysLoading ? (
            <p className="text-sm text-slate-400">Loading keys…</p>
          ) : activeKeys.length > 0 ? (
            <div className="space-y-2">
              {activeKeys.map((k) => (
                <div
                  key={k.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-800">
                      {k.name}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {k.scopes.length ? k.scopes.join(", ") : "all scopes"}
                      {k.lastUsedAt
                        ? ` · last used ${new Date(k.lastUsedAt).toLocaleDateString()}`
                        : " · never used"}
                    </p>
                  </div>
                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                    active
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-slate-300 px-4 py-5 text-center">
              <p className="text-sm text-slate-500">
                No API keys yet for this app.
              </p>
            </div>
          )}
          <Link
            to={appId ? `/apps/${appId}/api-keys` : "/apps"}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800"
          >
            <Key size={13} /> Manage API keys
          </Link>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left">
            <tr>
              <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
                Method
              </th>
              <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
                Endpoint
              </th>
              <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
                Description
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {API_ENDPOINTS.map((ep) => (
              <tr key={`${ep.method}-${ep.path}`} className="hover:bg-slate-50">
                <td className="px-4 py-2.5">
                  <span
                    className={clsx(
                      "rounded px-1.5 py-0.5 font-mono text-[11px] font-bold",
                      METHOD_STYLES[ep.method],
                    )}
                  >
                    {ep.method}
                  </span>
                </td>
                <td className="px-4 py-2.5 font-mono text-xs text-slate-700">
                  {ep.path}
                </td>
                <td className="px-4 py-2.5 text-slate-600">{ep.desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap gap-3">
        <a
          href={`${apiBaseUrl()}/api/reference`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          <BookOpen size={13} /> Interactive API reference <ExternalLink size={11} />
        </a>
        <a
          href={`${apiBaseUrl()}/openapi.json`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          openapi.json <ExternalLink size={11} />
        </a>
      </div>

      <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
        <ShieldCheck size={18} className="mt-0.5 shrink-0 text-amber-600" />
        <p className="text-sm leading-relaxed text-amber-900">
          <span className="font-semibold">Keys belong on servers.</span> An API key in a
          web bundle or mobile binary is public. For browser and mobile clients, proxy
          registration through your own backend and keep the key in an environment
          variable there.
        </p>
      </div>
    </div>
  );
}

/* ─────────────────────────  Shell  ───────────────────────── */

export function DeveloperHub() {
  const [tab, setTab] = useState<HubTab>("start");
  const { selectedApp } = useAppContext();
  const { token } = useAuth();

  const [vapidPublicKey, setVapidPublicKey] = useState<string | null>(null);
  const [configured, setConfigured] = useState<Record<string, boolean>>({});
  const [keys, setKeys] = useState<AppApiKey[]>([]);
  const [keysLoading, setKeysLoading] = useState(false);

  const appId = selectedApp?.id || "";

  useEffect(() => {
    if (!appId || !token) return;
    let cancelled = false;

    void (async () => {
      setKeysLoading(true);
      const [web, creds, apiKeys] = await Promise.allSettled([
        credentialService.getWebSdkViewConfig(appId, token),
        credentialService.getCredentials(appId, token),
        apiKeyService.list(appId, token),
      ]);
      if (cancelled) return;

      if (web.status === "fulfilled") {
        setVapidPublicKey(web.value.vapidPublicKey || null);
      }
      if (creds.status === "fulfilled") {
        const map: Record<string, boolean> = {};
        for (const c of creds.value) {
          map[c.provider] = Boolean(c.activeVersion);
        }
        setConfigured(map);
      }
      setKeys(apiKeys.status === "fulfilled" ? apiKeys.value : []);
      setKeysLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [appId, token]);

  const integrations = useMemo(
    () =>
      buildIntegrations({
        appId: appId || "YOUR_APP_ID",
        appName: selectedApp?.name || "",
        baseUrl: apiBaseUrl(),
        vapidPublicKey,
      }),
    [appId, selectedApp?.name, vapidPublicKey],
  );

  const tabs: { id: HubTab; label: string; icon: React.ReactNode }[] = [
    { id: "start", label: "Quickstart", icon: <Rocket size={14} /> },
    { id: "sdks", label: "SDKs", icon: <GitHubIcon size={14} /> },
    { id: "providers", label: "Provider setup", icon: <KeyRound size={14} /> },
    { id: "api", label: "REST API", icon: <BookOpen size={14} /> },
  ];

  return (
    <div className="rounded-2xl border border-slate-200/60 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-6 pb-0 pt-6">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold text-slate-900">Developer Hub</h3>
            <p className="mt-1 text-sm text-slate-500">
              {selectedApp
                ? `Integration for ${selectedApp.name} — snippets below are filled in with this app's real ID and endpoint.`
                : "Select an app to get snippets filled in with its real ID."}
            </p>
          </div>
          <a
            href={REPO_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50"
          >
            <GitHubIcon size={13} /> awsdang/notifyX <ExternalLink size={11} />
          </a>
        </div>

        <div className="-mb-px flex gap-1 overflow-x-auto">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={clsx(
                "flex shrink-0 items-center gap-1.5 rounded-t-lg border-b-2 px-4 py-2.5 text-sm font-semibold transition-all",
                tab === t.id
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-slate-500 hover:text-slate-700",
              )}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-6">
        {tab === "start" && (
          <Quickstart integrations={integrations} appId={appId} />
        )}
        {tab === "sdks" && <SdkCatalogue />}
        {tab === "providers" && <ProviderGuides configured={configured} />}
        {tab === "api" && (
          <ApiReference appId={appId} keys={keys} keysLoading={keysLoading} />
        )}
      </div>
    </div>
  );
}
