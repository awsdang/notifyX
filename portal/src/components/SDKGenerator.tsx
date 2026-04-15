import { useState } from "react";
import {
  Apple,
  BookOpen,
  CheckCircle2,
  Code2,
  Copy,
  ExternalLink,
  Globe,
  Key,
  Rocket,
  Server,
  Smartphone,
  Terminal,
} from "lucide-react";
import { Button } from "./ui/button";
import { clsx } from "clsx";
import { useAppContext } from "../context/AppContext";
import { useAuth } from "../context/AuthContext";

type Language = "javascript" | "swift" | "kotlin" | "curl" | "python" | "go";
type DevTab = "quickstart" | "examples" | "api" | "keys";

interface Snippet {
  id: Language;
  label: string;
  icon: React.ReactNode;
  platform: string;
  install?: string;
  code: string;
}

const SNIPPETS: Snippet[] = [
  {
    id: "curl",
    label: "cURL",
    icon: <Terminal size={16} />,
    platform: "Server",
    code: `curl -X POST https://api.notifyx.io/v1/notifications \\
  -H "X-API-Key: YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "appId": "app_9210",
    "userIds": ["user_123"],
    "templateId": "welcome_msg",
    "data": { "name": "John" }
  }'`,
  },
  {
    id: "javascript",
    label: "Node.js",
    icon: <Code2 size={16} />,
    platform: "Server",
    install: "npm install @notifyx/sdk",
    code: `import { NotifyX } from '@notifyx/sdk';

const nx = new NotifyX('YOUR_KEY');

await nx.send({
  appId: 'app_9210',
  userId: 'user_123',
  template: 'welcome_msg',
  variables: { name: 'John' }
});`,
  },
  {
    id: "python",
    label: "Python",
    icon: <Code2 size={16} />,
    platform: "Server",
    install: "pip install notifyx",
    code: `from notifyx import NotifyX

nx = NotifyX(api_key="YOUR_KEY")

nx.send(
    app_id="app_9210",
    user_id="user_123",
    template="welcome_msg",
    data={"name": "John"}
)`,
  },
  {
    id: "go",
    label: "Go",
    icon: <Server size={16} />,
    platform: "Server",
    install: "go get github.com/notifyx/notifyx-go",
    code: `package main

import "github.com/notifyx/notifyx-go"

func main() {
    client := notifyx.New("YOUR_KEY")

    client.Send(&notifyx.Notification{
        AppID:    "app_9210",
        UserID:   "user_123",
        Template: "welcome_msg",
        Data:     map[string]any{"name": "John"},
    })
}`,
  },
  {
    id: "swift",
    label: "Swift",
    icon: <Apple size={16} />,
    platform: "iOS",
    install: '.package(url: "https://github.com/notifyx/notifyx-swift", from: "2.0.0")',
    code: `import NotifyX

NotifyX.shared.configure(apiKey: "YOUR_KEY")

NotifyX.shared.registerDevice(
    token: deviceToken,
    userId: "user_123",
    language: "en"
)`,
  },
  {
    id: "kotlin",
    label: "Kotlin",
    icon: <Smartphone size={16} />,
    platform: "Android",
    install: 'implementation("io.notifyx:sdk:2.4.0")',
    code: `import io.notifyx.sdk.NotifyX

NotifyX.init(context, "YOUR_KEY")

NotifyX.registerDevice(
    token = "fcm_token_...",
    userId = "user_123",
    language = "en"
)`,
  },
];

const API_ENDPOINTS = [
  { method: "POST", path: "/v1/notifications", desc: "Send a push notification" },
  { method: "POST", path: "/v1/notifications/bulk", desc: "Send bulk notifications" },
  { method: "GET", path: "/v1/notifications/:id", desc: "Get notification status" },
  { method: "POST", path: "/v1/devices", desc: "Register a device" },
  { method: "DELETE", path: "/v1/devices/:id", desc: "Deactivate a device" },
  { method: "POST", path: "/v1/events/:eventName", desc: "Fire an automation trigger" },
  { method: "GET", path: "/v1/campaigns", desc: "List campaigns" },
  { method: "POST", path: "/v1/campaigns", desc: "Create a campaign" },
];

function CopyButton({ text, className }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className={clsx(
        "inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium transition-all",
        copied
          ? "bg-emerald-100 text-emerald-700"
          : "bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700",
        className,
      )}
    >
      {copied ? <CheckCircle2 size={12} /> : <Copy size={12} />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function CodeBlock({ code, className }: { code: string; className?: string }) {
  return (
    <div className={clsx("group relative", className)}>
      <div className="absolute end-3 top-3 opacity-0 transition-opacity group-hover:opacity-100">
        <CopyButton text={code} />
      </div>
      <pre className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900 p-5 font-mono text-[13px] leading-relaxed text-slate-300">
        {code}
      </pre>
    </div>
  );
}

export function SDKGenerator() {
  const [activeTab, setActiveTab] = useState<DevTab>("quickstart");
  const [selectedLang, setSelectedLang] = useState<Language>("javascript");
  const { selectedApp } = useAppContext();
  const { token } = useAuth();

  const currentSnippet = SNIPPETS.find((s) => s.id === selectedLang) || SNIPPETS[0];
  const maskedKey = token ? `${token.slice(0, 8)}...${token.slice(-4)}` : "nx_live_...";

  const tabs: { id: DevTab; label: string; icon: React.ReactNode }[] = [
    { id: "quickstart", label: "Quick Start", icon: <Rocket size={14} /> },
    { id: "examples", label: "Code Examples", icon: <Code2 size={14} /> },
    { id: "api", label: "API Reference", icon: <BookOpen size={14} /> },
    { id: "keys", label: "API Keys", icon: <Key size={14} /> },
  ];

  return (
    <div className="rounded-2xl border border-slate-200/60 bg-white shadow-sm">
      {/* Header */}
      <div className="border-b border-slate-100 px-6 pt-6 pb-0">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h3 className="flex items-center gap-2 text-lg font-bold text-slate-900">
              <Globe className="h-5 w-5 text-blue-600" />
              Developer Hub
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              Everything you need to integrate NotifyX into your app
            </p>
          </div>
          <a
            href="#"
            className="flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50"
          >
            Full Docs <ExternalLink size={12} />
          </a>
        </div>

        {/* Tabs */}
        <div className="-mb-px flex gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={clsx(
                "flex items-center gap-1.5 rounded-t-lg border-b-2 px-4 py-2.5 text-sm font-semibold transition-all",
                activeTab === tab.id
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-slate-500 hover:text-slate-700",
              )}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="p-6">
        {/* Quick Start */}
        {activeTab === "quickstart" && (
          <div className="space-y-8">
            <div>
              <h4 className="mb-1 text-base font-bold text-slate-900">Get started in minutes</h4>
              <p className="text-sm text-slate-500">
                Install the SDK for your platform and send your first notification.
              </p>
            </div>

            {/* Platform install cards */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {SNIPPETS.filter((s) => s.install).map((s) => (
                <div
                  key={s.id}
                  className={clsx(
                    "rounded-xl border p-4 transition-all cursor-pointer",
                    selectedLang === s.id
                      ? "border-blue-200 bg-blue-50/50 shadow-sm"
                      : "border-slate-200 hover:border-slate-300",
                  )}
                  onClick={() => setSelectedLang(s.id)}
                >
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div
                        className={clsx(
                          "flex h-8 w-8 items-center justify-center rounded-lg",
                          selectedLang === s.id
                            ? "bg-blue-100 text-blue-600"
                            : "bg-slate-100 text-slate-500",
                        )}
                      >
                        {s.icon}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{s.label}</p>
                        <p className="text-[10px] font-medium uppercase tracking-wider text-slate-400">
                          {s.platform}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between rounded-lg bg-slate-900 px-3 py-2">
                    <code className="truncate font-mono text-xs text-slate-300">{s.install}</code>
                    <CopyButton text={s.install!} className="ml-2 shrink-0 bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white" />
                  </div>
                </div>
              ))}
            </div>

            {/* Quick start code */}
            <div>
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-700">
                  Then send your first notification:
                </p>
              </div>
              <CodeBlock code={currentSnippet.code} />
            </div>
          </div>
        )}

        {/* Code Examples */}
        {activeTab === "examples" && (
          <div className="flex flex-col gap-6 lg:flex-row">
            {/* Language sidebar */}
            <div className="flex gap-1 overflow-x-auto lg:w-48 lg:shrink-0 lg:flex-col">
              {SNIPPETS.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSelectedLang(s.id)}
                  className={clsx(
                    "flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition-all whitespace-nowrap",
                    selectedLang === s.id
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "text-slate-500 hover:bg-slate-50 hover:text-slate-700",
                  )}
                >
                  <span
                    className={clsx(
                      "flex h-7 w-7 items-center justify-center rounded-lg shrink-0",
                      selectedLang === s.id ? "bg-white/10" : "bg-slate-100",
                    )}
                  >
                    {s.icon}
                  </span>
                  {s.label}
                  <span
                    className={clsx(
                      "ml-auto rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase",
                      selectedLang === s.id
                        ? "bg-white/10 text-white/70"
                        : "bg-slate-100 text-slate-400",
                    )}
                  >
                    {s.platform}
                  </span>
                </button>
              ))}
            </div>

            {/* Code panel */}
            <div className="min-w-0 flex-1">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h4 className="text-base font-bold text-slate-900">{currentSnippet.label}</h4>
                  <p className="text-xs text-slate-500">{currentSnippet.platform} integration</p>
                </div>
              </div>

              {currentSnippet.install && (
                <div className="mb-4 flex items-center gap-3 rounded-xl bg-slate-50 px-4 py-3">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Install
                  </span>
                  <code className="flex-1 truncate font-mono text-sm text-slate-700">
                    {currentSnippet.install}
                  </code>
                  <CopyButton text={currentSnippet.install} />
                </div>
              )}

              <CodeBlock code={currentSnippet.code} />

              <p className="mt-3 text-xs text-amber-600">
                Replace YOUR_KEY with your actual API key from the API Keys tab.
              </p>
            </div>
          </div>
        )}

        {/* API Reference */}
        {activeTab === "api" && (
          <div className="space-y-6">
            <div>
              <h4 className="mb-1 text-base font-bold text-slate-900">REST API Endpoints</h4>
              <p className="text-sm text-slate-500">
                Base URL: <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs">https://api.notifyx.io</code>
              </p>
            </div>

            <div className="overflow-hidden rounded-xl border border-slate-200">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Method
                    </th>
                    <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Endpoint
                    </th>
                    <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Description
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {API_ENDPOINTS.map((ep, i) => (
                    <tr
                      key={`${ep.method}-${ep.path}`}
                      className={clsx(
                        "transition-colors hover:bg-slate-50",
                        i < API_ENDPOINTS.length - 1 && "border-b border-slate-100",
                      )}
                    >
                      <td className="px-4 py-3">
                        <span
                          className={clsx(
                            "inline-block rounded-md px-2 py-0.5 font-mono text-xs font-bold",
                            ep.method === "GET"
                              ? "bg-emerald-50 text-emerald-700"
                              : ep.method === "POST"
                                ? "bg-blue-50 text-blue-700"
                                : ep.method === "DELETE"
                                  ? "bg-rose-50 text-rose-700"
                                  : "bg-amber-50 text-amber-700",
                          )}
                        >
                          {ep.method}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-700">{ep.path}</td>
                      <td className="px-4 py-3 text-slate-600">{ep.desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                Authentication
              </p>
              <p className="text-sm text-slate-700">
                Include your API key in the <code className="rounded bg-white px-1 py-0.5 font-mono text-xs">X-API-Key</code> header with every request.
              </p>
            </div>
          </div>
        )}

        {/* API Keys */}
        {activeTab === "keys" && (
          <div className="space-y-6">
            <div>
              <h4 className="mb-1 text-base font-bold text-slate-900">API Keys</h4>
              <p className="text-sm text-slate-500">
                Manage API keys for {selectedApp?.name || "your app"}.
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Current API Key
                  </p>
                  <p className="mt-1 font-mono text-sm text-slate-700">{maskedKey}</p>
                </div>
                <div className="flex items-center gap-2">
                  {token && (
                    <CopyButton text={token} className="h-8 px-3" />
                  )}
                  <Button variant="outline" size="sm">
                    Regenerate
                  </Button>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <p className="text-sm text-amber-800">
                <span className="font-semibold">Keep your API key secret.</span>{" "}
                Never expose it in client-side code or public repositories. Use environment variables in production.
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                Usage Example
              </p>
              <CodeBlock
                code={`# Set as environment variable
export NOTIFYX_API_KEY="${maskedKey}"

# Use in requests
curl -H "X-API-Key: $NOTIFYX_API_KEY" \\
  https://api.notifyx.io/v1/notifications`}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
