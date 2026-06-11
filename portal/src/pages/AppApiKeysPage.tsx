import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Copy,
  Key,
  Loader2,
  RefreshCw,
  Shield,
  Trash2,
} from "lucide-react";
import { useAppContext } from "../context/AppContext";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { useConfirmDialog } from "../context/ConfirmDialogContext";
import {
  apiKeyService,
  type AppApiKey,
  type AppApiKeySecret,
} from "../services/apiKeyService";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/Badge";
import { Card, CardHeader, CardTitle } from "../components/ui/Card";
import { EmptyState } from "../components/ui/EmptyState";
import { Input } from "../components/ui/Input";

const SCOPE_PRESETS = [
  {
    value: "*",
    label: "Full access",
    description: "Allows any machine-authenticated app action.",
  },
  {
    value: "users:write",
    label: "Users write",
    description: "Create and update app users.",
  },
  {
    value: "devices:write",
    label: "Devices write",
    description: "Register and manage user devices.",
  },
  {
    value: "notifications:test",
    label: "Notifications test",
    description: "Send test notifications.",
  },
];

function formatWhen(value: string | null | undefined): string {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Never";
  return date.toLocaleString();
}

function normalizeScopes(selectedScopes: string[], customScopes: string): string[] {
  const custom = customScopes
    .split(",")
    .map((scope) => scope.trim())
    .filter(Boolean);

  return Array.from(new Set([...selectedScopes, ...custom]));
}

export function AppApiKeysPage() {
  const { appId } = useParams<{ appId: string }>();
  const navigate = useNavigate();
  const { apps, selectedApp, setSelectedApp } = useAppContext();
  const { token, canManageApp } = useAuth();
  const { success, error, info } = useToast();
  const { confirm } = useConfirmDialog();

  const app = apps.find((item) => item.id === appId);
  const canManageCurrentApp = app ? canManageApp(app.id) : false;

  const [keys, setKeys] = useState<AppApiKey[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [revokingKeyId, setRevokingKeyId] = useState<string | null>(null);
  const [rotatingKeyId, setRotatingKeyId] = useState<string | null>(null);
  const [revealedSecret, setRevealedSecret] = useState<AppApiKeySecret | null>(null);
  const [name, setName] = useState("");
  const [selectedScopes, setSelectedScopes] = useState<string[]>([
    "users:write",
    "devices:write",
  ]);
  const [customScopes, setCustomScopes] = useState("");
  const [expiresAt, setExpiresAt] = useState("");

  const effectiveScopes = useMemo(
    () => normalizeScopes(selectedScopes, customScopes),
    [selectedScopes, customScopes],
  );

  useEffect(() => {
    if (app && selectedApp?.id !== app.id) {
      setSelectedApp(app);
    }
  }, [app, selectedApp, setSelectedApp]);

  useEffect(() => {
    if (!app || !token || !canManageCurrentApp) {
      setIsLoading(false);
      return;
    }

    void loadKeys();
  }, [app?.id, token, canManageCurrentApp]);

  async function loadKeys() {
    if (!app) return;

    setIsLoading(true);
    try {
      const nextKeys = await apiKeyService.list(app.id, token);
      setKeys(nextKeys);
    } catch (loadError: any) {
      error(loadError?.message || "Failed to load API keys.");
    } finally {
      setIsLoading(false);
    }
  }

  function toggleScope(scope: string) {
    setSelectedScopes((current) =>
      current.includes(scope)
        ? current.filter((item) => item !== scope)
        : [...current, scope],
    );
  }

  function resetForm() {
    setName("");
    setSelectedScopes(["users:write", "devices:write"]);
    setCustomScopes("");
    setExpiresAt("");
  }

  async function handleCreateKey(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!app) return;

    const trimmedName = name.trim();
    if (trimmedName.length < 2) {
      error("Key name must be at least 2 characters.");
      return;
    }

    const isoExpiry = expiresAt ? new Date(expiresAt).toISOString() : undefined;
    if (expiresAt && Number.isNaN(new Date(expiresAt).getTime())) {
      error("Expiration date is invalid.");
      return;
    }

    setIsSubmitting(true);
    try {
      const created = await apiKeyService.create(
        app.id,
        {
          name: trimmedName,
          scopes: effectiveScopes,
          expiresAt: isoExpiry,
        },
        token,
      );
      setRevealedSecret(created);
      resetForm();
      await loadKeys();
      success("API key created. Copy the secret now.");
    } catch (createError: any) {
      error(createError?.message || "Failed to create API key.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleCopySecret(secret: string) {
    try {
      await navigator.clipboard.writeText(secret);
      info("API key copied to clipboard.");
    } catch {
      error("Failed to copy API key.");
    }
  }

  async function handleRevokeKey(key: AppApiKey) {
    if (!app) return;

    const accepted = await confirm({
      title: "Revoke API key",
      description: `Revoke ${key.name}? Existing integrations using it will stop working immediately.`,
      confirmText: "Revoke key",
      destructive: true,
    });
    if (!accepted) return;

    setRevokingKeyId(key.id);
    try {
      await apiKeyService.revoke(app.id, key.id, token);
      await loadKeys();
      success("API key revoked.");
    } catch (revokeError: any) {
      error(revokeError?.message || "Failed to revoke API key.");
    } finally {
      setRevokingKeyId(null);
    }
  }

  async function handleRotateKey(key: AppApiKey) {
    if (!app) return;

    const accepted = await confirm({
      title: "Rotate API key",
      description: `Rotate ${key.name}? The current secret will be deactivated and a new secret will be shown once.`,
      confirmText: "Rotate key",
    });
    if (!accepted) return;

    setRotatingKeyId(key.id);
    try {
      const rotated = await apiKeyService.rotate(
        app.id,
        key.id,
        {
          scopes: key.scopes,
          expiresAt: key.expiresAt || undefined,
        },
        token,
      );
      setRevealedSecret(rotated);
      await loadKeys();
      success("API key rotated. Copy the new secret now.");
    } catch (rotateError: any) {
      error(rotateError?.message || "Failed to rotate API key.");
    } finally {
      setRotatingKeyId(null);
    }
  }

  if (!apps.length) {
    return (
      <EmptyState
        icon={<Key className="h-6 w-6" />}
        title="No apps registered"
        description="Create an app first to issue scoped API keys."
      />
    );
  }

  if (!app) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  if (!canManageCurrentApp) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(`/apps/${app.id}`)}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="text-sm text-slate-500">
            <Link to="/apps" className="hover:text-slate-900">Apps</Link>
            <span className="mx-1">/</span>
            <Link to={`/apps/${app.id}`} className="hover:text-slate-900">{app.name}</Link>
            <span className="mx-1">/</span>
            <span className="font-medium text-slate-900">API Keys</span>
          </div>
        </div>
        <Card>
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">
            You do not have permission to manage API keys for this app.
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate(`/apps/${app.id}`)}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <div className="text-sm text-slate-500">
            <Link to="/apps" className="hover:text-slate-900">Apps</Link>
            <span className="mx-1">/</span>
            <Link to={`/apps/${app.id}`} className="hover:text-slate-900">{app.name}</Link>
            <span className="mx-1">/</span>
            <span className="font-medium text-slate-900">API Keys</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">Scoped API Keys</h1>
          <p className="text-sm text-slate-500">
            Create machine keys for this app with only the scopes an integration needs.
          </p>
        </div>
      </div>

      {revealedSecret && (
        <Card className="border-emerald-200 bg-emerald-50/70">
          <CardHeader className="items-start gap-3 sm:flex-row sm:items-center">
            <div>
              <CardTitle icon={<Shield className="h-5 w-5 text-emerald-600" />}>
                Secret Available Once
              </CardTitle>
              <p className="mt-1 text-sm text-emerald-900/80">
                Save this raw key now. Only the hashed value is stored after this screen.
              </p>
            </div>
            <Button
              variant="outline"
              className="border-emerald-300 bg-white text-emerald-700 hover:bg-emerald-100"
              onClick={() => void handleCopySecret(revealedSecret.apiKey)}
            >
              <Copy className="mr-2 h-4 w-4" />
              Copy secret
            </Button>
          </CardHeader>
          <div className="space-y-2 rounded-2xl border border-emerald-200 bg-white p-4">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-slate-900">{revealedSecret.name}</p>
              <Badge variant="success" dot>
                Active
              </Badge>
            </div>
            <code className="block overflow-x-auto rounded-xl bg-slate-950 px-4 py-3 text-sm text-emerald-300">
              {revealedSecret.apiKey}
            </code>
          </div>
        </Card>
      )}

      <div className="grid gap-6 xl:grid-cols-[1.05fr,1.45fr]">
        <Card>
          <CardHeader>
            <CardTitle icon={<Key className="h-5 w-5 text-blue-600" />}>
              Create API Key
            </CardTitle>
          </CardHeader>
          <form className="space-y-4" onSubmit={handleCreateKey}>
            <Input
              label="Key name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="CRM sync worker"
              required
            />

            <div className="space-y-2">
              <div>
                <p className="text-sm font-medium text-slate-700">Preset scopes</p>
                <p className="text-xs text-slate-500">
                  Leave empty to create a key without explicit scope restrictions.
                </p>
              </div>
              <div className="space-y-2">
                {SCOPE_PRESETS.map((scope) => {
                  const checked = selectedScopes.includes(scope.value);
                  return (
                    <label
                      key={scope.value}
                      className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 px-3 py-3 text-sm transition-colors hover:border-blue-200"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleScope(scope.value)}
                        className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600"
                      />
                      <span>
                        <span className="block font-medium text-slate-900">{scope.label}</span>
                        <span className="block text-slate-500">{scope.description}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>

            <Input
              label="Custom scopes"
              value={customScopes}
              onChange={(event) => setCustomScopes(event.target.value)}
              placeholder="orders:read, profiles:write"
              hint="Comma-separated. Use this if your backend adds more machine scopes later."
            />

            <Input
              label="Expires at"
              type="datetime-local"
              value={expiresAt}
              onChange={(event) => setExpiresAt(event.target.value)}
              hint="Optional. Leave empty for a non-expiring key."
            />

            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-sm font-medium text-slate-900">Scopes to issue</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {effectiveScopes.length > 0 ? (
                  effectiveScopes.map((scope) => (
                    <Badge key={scope} variant="info">
                      {scope}
                    </Badge>
                  ))
                ) : (
                  <span className="text-sm text-slate-500">No scopes selected</span>
                )}
              </div>
            </div>

            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create key"
              )}
            </Button>
          </form>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle icon={<Shield className="h-5 w-5 text-slate-700" />}>
              Existing Keys
            </CardTitle>
            <Button variant="outline" onClick={() => void loadKeys()} disabled={isLoading}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
          </CardHeader>

          {isLoading ? (
            <div className="flex items-center justify-center py-16 text-slate-500">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Loading API keys...
            </div>
          ) : keys.length === 0 ? (
            <EmptyState
              icon={<Key className="h-6 w-6" />}
              title="No API keys yet"
              description="Create a scoped key for server-to-server calls or SDK demos."
            />
          ) : (
            <div className="space-y-3">
              {keys.map((key) => (
                <div
                  key={key.id}
                  className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4"
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-semibold text-slate-900">{key.name}</h3>
                        <Badge variant={key.isActive ? "success" : "outline"} dot>
                          {key.isActive ? "Active" : "Revoked"}
                        </Badge>
                        {key.rotatedFromId ? <Badge variant="warning">Rotated</Badge> : null}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {key.scopes.length > 0 ? (
                          key.scopes.map((scope) => (
                            <Badge key={`${key.id}-${scope}`} variant="info">
                              {scope}
                            </Badge>
                          ))
                        ) : (
                          <Badge variant="outline">No explicit scopes</Badge>
                        )}
                      </div>
                      <div className="grid gap-2 text-sm text-slate-500 sm:grid-cols-2">
                        <span>Created: {formatWhen(key.createdAt)}</span>
                        <span>Last used: {formatWhen(key.lastUsedAt)}</span>
                        <span>Expires: {formatWhen(key.expiresAt)}</span>
                        <span className="font-mono text-xs text-slate-400">{key.id}</span>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        disabled={!key.isActive || rotatingKeyId === key.id}
                        onClick={() => void handleRotateKey(key)}
                      >
                        {rotatingKeyId === key.id ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Rotating...
                          </>
                        ) : (
                          <>
                            <RefreshCw className="mr-2 h-4 w-4" />
                            Rotate
                          </>
                        )}
                      </Button>
                      <Button
                        variant="destructive"
                        disabled={!key.isActive || revokingKeyId === key.id}
                        onClick={() => void handleRevokeKey(key)}
                      >
                        {revokingKeyId === key.id ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Revoking...
                          </>
                        ) : (
                          <>
                            <Trash2 className="mr-2 h-4 w-4" />
                            Revoke
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}