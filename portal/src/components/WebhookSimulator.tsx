import { useState } from "react";
import {
  Terminal,
  Send,
  Code2,
  Copy,
  CheckCircle2,
  ChevronRight,
  Loader2,
  Bug,
  Clock,
} from "lucide-react";
import { Button } from "./ui/button";
import { Card, CardHeader, CardTitle } from "./ui/Card";

import { Badge } from "./ui/Badge";
import { EmptyState } from "./ui/EmptyState";
import { clsx } from "clsx";

const EVENT_TEMPLATES = [
  {
    id: "notification.sent",
    label: "Notification Sent",
    payload: {
      event: "notification.sent",
      notificationId: "notif_78210",
      recipient: "user_123",
      provider: "fcm",
      timestamp: new Date().toISOString(),
    },
  },
  {
    id: "notification.delivered",
    label: "Notification Delivered",
    payload: {
      event: "notification.delivered",
      notificationId: "notif_78210",
      recipient: "user_123",
      platform: "android",
      timestamp: new Date().toISOString(),
    },
  },
  {
    id: "notification.failed",
    label: "Delivery Failure",
    payload: {
      event: "notification.failed",
      notificationId: "notif_78210",
      error: "TOKEN_INVALID",
      details: "The FCM registration token has expired.",
      timestamp: new Date().toISOString(),
    },
  },
];

interface SimulationRun {
  id: string;
  timestamp: Date;
  status: number;
  url: string;
  event: string;
}

export function WebhookSimulator() {
  const [targetUrl, setTargetUrl] = useState(
    "https://api.yourdomain.com/webhooks/notifyx",
  );
  const [selectedTemplate, setSelectedTemplate] = useState(EVENT_TEMPLATES[0]);
  const [payload, setPayload] = useState(
    JSON.stringify(EVENT_TEMPLATES[0].payload, null, 2),
  );
  const [isSimulating, setIsSimulating] = useState(false);
  const [lastResponse, setLastResponse] = useState<any>(null);
  const [copied, setCopied] = useState(false);
  const [runs, setRuns] = useState<SimulationRun[]>([]);

  const handleTemplateChange = (id: string) => {
    const template = EVENT_TEMPLATES.find((t) => t.id === id)!;
    setSelectedTemplate(template);
    setPayload(JSON.stringify(template.payload, null, 2));
  };

  const runSimulation = async () => {
    setIsSimulating(true);
    setLastResponse(null);

    try {
      let parsedPayload: Record<string, unknown>;
      try {
        parsedPayload = JSON.parse(payload);
      } catch {
        throw new Error("Payload must be valid JSON");
      }

      const response = await fetch(targetUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-NotifyX-Simulator": "true",
        },
        body: JSON.stringify(parsedPayload),
      });

      const rawBody = await response.text();
      let body: any = rawBody;
      try {
        body = rawBody ? JSON.parse(rawBody) : null;
      } catch {
        // Keep text body
      }

      const headers: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        if (
          key === "content-type" ||
          key === "x-request-id" ||
          key === "server" ||
          key.startsWith("x-")
        ) {
          headers[key] = value;
        }
      });

      setLastResponse({
        status: response.status,
        statusText: response.statusText,
        headers,
        body,
      });

      setRuns((prev) => [
        {
          id: crypto.randomUUID(),
          timestamp: new Date(),
          status: response.status,
          url: targetUrl,
          event: selectedTemplate.id,
        },
        ...prev.slice(0, 9),
      ]);
    } catch (error: any) {
      setLastResponse({
        status: 0,
        statusText: "NETWORK_ERROR",
        headers: {
          "content-type": "text/plain",
        },
        body: {
          success: false,
          error: error?.message || "Failed to send webhook request",
        },
      });

      setRuns((prev) => [
        {
          id: crypto.randomUUID(),
          timestamp: new Date(),
          status: 0,
          url: targetUrl,
          event: selectedTemplate.id,
        },
        ...prev.slice(0, 9),
      ]);
    } finally {
      setIsSimulating(false);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(payload);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Card padding="lg" className="animate-in fade-in slide-in-from-bottom-4 duration-500">
      <CardHeader>
        <CardTitle icon={<Bug className="h-5 w-5 text-indigo-600" />}>
          Webhook Simulator
        </CardTitle>
        <div className="flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1.5">
          <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-indigo-500" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-indigo-700">
            Sandbox Mode
          </span>
        </div>
      </CardHeader>
      <p className="-mt-2 mb-6 text-sm text-slate-500">
        Test your receiver logic by sending mock event payloads.
      </p>

      <div className="grid grid-cols-1 gap-10 lg:grid-cols-2">
        {/* Configuration side */}
        <div className="space-y-6">
          <div className="space-y-2">
            <label className="ms-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">
              Target Endpoint
            </label>
            <div className="group relative">
              <Terminal className="pointer-events-none absolute start-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-indigo-600" />
              <input
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pe-4 ps-11 font-mono text-sm shadow-sm transition-all focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                value={targetUrl}
                onChange={(e) => setTargetUrl(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label className="ms-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                Mock Event Payload
              </label>
              <div className="flex gap-2">
                {EVENT_TEMPLATES.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => handleTemplateChange(t.id)}
                    className={clsx(
                      "rounded-xl px-3 py-1 text-[10px] font-bold transition-all",
                      selectedTemplate.id === t.id
                        ? "bg-indigo-600 text-white shadow-lg shadow-indigo-200"
                        : "bg-slate-100 text-slate-500 hover:bg-slate-200",
                    )}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="relative">
              <textarea
                className="h-80 w-full resize-none rounded-xl border border-slate-800 bg-slate-900 p-6 font-mono text-xs text-indigo-300 shadow-inner outline-none focus:ring-2 focus:ring-indigo-500/20"
                value={payload}
                onChange={(e) => setPayload(e.target.value)}
              />
              <button
                onClick={copyToClipboard}
                className="absolute end-4 top-4 rounded-xl bg-slate-800 p-2 text-slate-400 transition-colors hover:text-white"
              >
                {copied ? (
                  <CheckCircle2 size={16} className="text-emerald-400" />
                ) : (
                  <Copy size={16} />
                )}
              </button>
            </div>
          </div>

          <Button
            className="h-14 w-full rounded-xl bg-indigo-600 text-lg font-bold shadow-xl shadow-indigo-500/20 hover:bg-indigo-700 group"
            onClick={runSimulation}
            disabled={isSimulating}
          >
            {isSimulating ? (
              <Loader2 className="me-2 animate-spin" />
            ) : (
              <Send
                className="me-2 transition-transform group-hover:-translate-y-1 group-hover:translate-x-1"
                size={20}
              />
            )}
            Trigger Webhook Test
          </Button>
        </div>

        {/* Response side */}
        <div className="flex flex-col">
          <label className="mb-4 ms-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">
            Verification Feed
          </label>
          <div className="flex flex-1 flex-col items-center justify-center overflow-hidden rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8">
            {!lastResponse && !isSimulating && (
              <EmptyState
                icon={<Code2 className="h-6 w-6" />}
                title="Ready for Simulation"
                description="Trigger a test event to see how your server handles the NotifyX payload."
              />
            )}

            {isSimulating && (
              <div className="space-y-4 text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-slate-100 bg-white shadow-md">
                  <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
                </div>
                <div className="flex flex-col gap-1">
                  <p className="font-bold text-indigo-600">
                    Simulating Event...
                  </p>
                  <p className="font-mono text-[10px] text-indigo-400">
                    POST {targetUrl.slice(0, 30)}...
                  </p>
                </div>
              </div>
            )}

            {lastResponse && !isSimulating && (
              <div className="flex h-full w-full animate-in zoom-in-95 duration-500 flex-col items-stretch">
                <div className="mb-6 flex items-center gap-4">
                  <div
                    className={clsx(
                      "flex items-center gap-2 rounded-xl px-4 py-2 text-lg font-black tracking-tight shadow-sm",
                      lastResponse.status >= 200 && lastResponse.status < 300
                        ? "bg-emerald-50 text-emerald-600"
                        : "bg-rose-50 text-rose-600",
                    )}
                  >
                    <div
                      className={clsx(
                        "h-3 w-3 rounded-full",
                        lastResponse.status >= 200 && lastResponse.status < 300
                          ? "bg-emerald-500"
                          : "bg-rose-500",
                      )}
                    />
                    {lastResponse.status} {lastResponse.statusText}
                  </div>
                  <div className="h-px flex-1 bg-slate-200" />
                </div>

                <div className="space-y-6 overflow-y-auto pe-2">
                  <div>
                    <h5 className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
                      <ChevronRight size={10} className="text-indigo-400" />{" "}
                      Response Headers
                    </h5>
                    <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-4">
                      {Object.entries(lastResponse.headers).map(
                        ([k, v]: [any, any]) => (
                          <div
                            key={k}
                            className="flex items-center justify-between text-[11px]"
                          >
                            <span className="font-mono text-slate-500">
                              {k}
                            </span>
                            <span className="font-bold text-slate-900">
                              {v}
                            </span>
                          </div>
                        ),
                      )}
                    </div>
                  </div>

                  <div>
                    <h5 className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
                      <ChevronRight size={10} className="text-indigo-400" />{" "}
                      Response Body
                    </h5>
                    <pre className="overflow-x-auto whitespace-pre-wrap rounded-xl border border-slate-200 bg-white p-4 font-mono text-[11px] leading-relaxed text-slate-700 shadow-sm">
                      {JSON.stringify(lastResponse.body, null, 2)}
                    </pre>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Run History */}
          {runs.length > 0 && (
            <div className="mt-4 space-y-1">
              <p className="ms-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                <Clock className="h-3 w-3" />
                Recent Runs
              </p>
              {runs.map((run) => (
                <div
                  key={run.id}
                  className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs"
                >
                  <Badge
                    variant={
                      run.status >= 200 && run.status < 300
                        ? "success"
                        : "error"
                    }
                  >
                    {run.status || "ERR"}
                  </Badge>
                  <span className="font-mono text-[11px] text-slate-500">
                    {run.timestamp.toLocaleTimeString()}
                  </span>
                  <span className="truncate font-mono text-[11px] text-slate-400">
                    {run.event}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
