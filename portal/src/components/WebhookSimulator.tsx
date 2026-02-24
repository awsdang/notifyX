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
} from "lucide-react";
import { Button } from "./ui/button";
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
    <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm overflow-hidden flex flex-col animate-in slide-in-from-bottom-10 duration-700">
      <div className="p-8 border-b border-gray-50 flex items-center justify-between">
        <div>
          <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Bug className="w-5 h-5 text-indigo-600" />
            Webhook Simulator
          </h3>
          <p className="text-sm text-gray-400 mt-1">
            Test your receiver logic by sending mock event payloads.
          </p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 rounded-full">
          <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
          <span className="text-[10px] font-bold text-indigo-700 uppercase tracking-widest">
            Sandbox Mode
          </span>
        </div>
      </div>

      <div className="p-8 grid grid-cols-1 lg:grid-cols-2 gap-10">
        {/* Configuration side */}
        <div className="space-y-6">
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ms-1">
              Target Endpoint
            </label>
            <div className="relative group">
              <Terminal className="absolute start-4 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4 group-focus-within:text-indigo-600 transition-colors" />
              <input
                className="w-full ps-11 pe-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-mono focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all"
                value={targetUrl}
                onChange={(e) => setTargetUrl(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ms-1">
                Mock Event Payload
              </label>
              <div className="flex gap-2">
                {EVENT_TEMPLATES.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => handleTemplateChange(t.id)}
                    className={clsx(
                      "px-3 py-1 rounded-lg text-[10px] font-bold transition-all",
                      selectedTemplate.id === t.id
                        ? "bg-indigo-600 text-white shadow-lg shadow-indigo-200"
                        : "bg-slate-100 text-gray-500 hover:bg-slate-200",
                    )}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="relative">
              <textarea
                className="w-full h-80 p-6 bg-slate-900 text-indigo-300 font-mono text-xs rounded-3xl border border-slate-800 shadow-inner resize-none focus:ring-4 focus:ring-indigo-500/5 outline-none"
                value={payload}
                onChange={(e) => setPayload(e.target.value)}
              />
              <button
                onClick={copyToClipboard}
                className="absolute end-4 top-4 p-2 bg-slate-800 text-slate-400 hover:text-white rounded-xl transition-colors"
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
            className="w-full h-14 bg-indigo-600 hover:bg-indigo-700 rounded-[1.25rem] text-lg font-bold shadow-xl shadow-indigo-500/20 group"
            onClick={runSimulation}
            disabled={isSimulating}
          >
            {isSimulating ? (
              <Loader2 className="animate-spin me-2" />
            ) : (
              <Send
                className="me-2 group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform"
                size={20}
              />
            )}
            Trigger Webhook Test
          </Button>
        </div>

        {/* Response side */}
        <div className="flex flex-col">
          <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ms-1 mb-4">
            Verification Feed
          </label>
          <div className="flex-1 bg-slate-50 border border-slate-200 border-dashed rounded-[2.5rem] flex flex-col items-center justify-center p-8 overflow-hidden relative">
            {!lastResponse && !isSimulating && (
              <div className="text-center space-y-4 max-w-xs">
                <div className="w-16 h-16 bg-white rounded-3xl shadow-sm border border-slate-100 flex items-center justify-center mx-auto">
                  <Code2 className="w-8 h-8 text-slate-300" />
                </div>
                <h4 className="font-bold text-slate-400">
                  Ready for Simulation
                </h4>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Trigger a test event to see how your server handles the
                  NotifyX payload.
                </p>
              </div>
            )}

            {isSimulating && (
              <div className="text-center space-y-4">
                <div className="w-16 h-16 bg-white rounded-3xl shadow-md flex items-center justify-center mx-auto">
                  <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
                </div>
                <div className="flex flex-col gap-1">
                  <p className="font-bold text-indigo-600">
                    Simulating Event...
                  </p>
                  <p className="text-[10px] text-indigo-400 font-mono">
                    POST {targetUrl.slice(0, 30)}...
                  </p>
                </div>
              </div>
            )}

            {lastResponse && !isSimulating && (
              <div className="w-full h-full flex flex-col items-stretch animate-in zoom-in-95 duration-500">
                <div className="flex items-center gap-4 mb-6">
                  <div
                    className={clsx(
                      "px-4 py-2 rounded-2xl text-lg font-black tracking-tight flex items-center gap-2 shadow-sm",
                      lastResponse.status === 200
                        ? "bg-emerald-50 text-emerald-600"
                        : "bg-red-50 text-red-600",
                    )}
                  >
                    <div
                      className={clsx(
                        "w-3 h-3 rounded-full",
                        lastResponse.status === 200
                          ? "bg-emerald-500"
                          : "bg-red-500",
                      )}
                    />
                    {lastResponse.status} {lastResponse.statusText}
                  </div>
                  <div className="flex-1 h-px bg-slate-200" />
                </div>

                <div className="space-y-6 overflow-y-auto pe-2">
                  <div>
                    <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                      <ChevronRight size={10} className="text-indigo-400" />{" "}
                      Response Headers
                    </h5>
                    <div className="p-4 bg-white rounded-2xl border border-slate-200 space-y-2">
                      {Object.entries(lastResponse.headers).map(
                        ([k, v]: [any, any]) => (
                          <div
                            key={k}
                            className="flex items-center justify-between text-[11px]"
                          >
                            <span className="text-slate-500 font-mono">
                              {k}
                            </span>
                            <span className="text-slate-900 font-bold">
                              {v}
                            </span>
                          </div>
                        ),
                      )}
                    </div>
                  </div>

                  <div>
                    <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                      <ChevronRight size={10} className="text-indigo-400" />{" "}
                      Response Body
                    </h5>
                    <pre className="p-4 bg-white rounded-2xl border border-slate-200 text-[11px] font-mono whitespace-pre-wrap overflow-x-auto text-slate-700 shadow-sm leading-relaxed">
                      {JSON.stringify(lastResponse.body, null, 2)}
                    </pre>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
