import { useState } from "react";
import { Bell, ShieldCheck, AlertCircle } from "lucide-react";
import { Button } from "./ui/button";
import { apiFetch } from "../lib/api";
import { LanguageSelector } from "./LanguageSelector";
import { useScopedTranslation } from "../context/I18nContext";

interface InitialSetupPageProps {
  setupTokenRequired: boolean;
  onSetupComplete: (credentials: { email: string; password: string }) => void;
}

export function InitialSetupPage({
  setupTokenRequired,
  onSetupComplete,
}: InitialSetupPageProps) {
  const ti = useScopedTranslation("components", "InitialSetupPage");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [setupToken, setSetupToken] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      await apiFetch("/admin/setup", {
        method: "POST",
        headers: {
          ...(setupTokenRequired && setupToken
            ? { "X-Setup-Token": setupToken }
            : {}),
        },
        body: JSON.stringify({ name, email, password }),
      });

      onSetupComplete({ email, password });
    } catch (err: any) {
      setError(err?.message || ti("failedCreateAdmin", "Failed to create initial admin"));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-linear-to-br from-slate-50 to-slate-100 p-4">
      <div className="mx-auto flex w-full max-w-md justify-end py-4">
        <LanguageSelector />
      </div>

      <div className="mx-auto flex w-full max-w-md items-center justify-center">
        <div className="w-full">
          <div className="mb-8 text-center">
            <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-linear-to-br from-blue-600 to-purple-600">
              <Bell className="h-8 w-8 text-white" />
            </div>
            <h1 className="bg-linear-to-r from-blue-600 to-purple-600 bg-clip-text text-3xl font-bold text-transparent">
              NotifyX
            </h1>
            <p className="mt-2 text-gray-500">
              {ti("firstTimeStartup", "First-time startup")}
            </p>
          </div>

          <div className="rounded-2xl border bg-white p-8 shadow-xl">
            <h2 className="mb-2 text-xl font-semibold">
              {ti("createSuperAdmin", "Create super admin")}
            </h2>
            <p className="mb-6 text-sm text-gray-500">
              {ti(
                "setupDescription",
                "This page is available only once, before the first admin exists.",
              )}
            </p>

            {error && (
              <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-red-700">
                <AlertCircle className="h-4 w-4" />
                <span className="text-sm">{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  {ti("name", "Name")}
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-lg border px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                  placeholder={ti("namePlaceholder", "Super Admin")}
                  minLength={2}
                  required
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  {ti("email", "Email")}
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                  placeholder={ti("emailPlaceholder", "admin@example.com")}
                  required
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  {ti("password", "Password")}
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                  placeholder={ti("passwordPlaceholder", "••••••••")}
                  minLength={8}
                  required
                />
              </div>

              {setupTokenRequired && (
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    {ti("setupToken", "Setup token")}
                  </label>
                  <div className="relative">
                    <ShieldCheck className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <input
                      type="password"
                      value={setupToken}
                      onChange={(e) => setSetupToken(e.target.value)}
                      className="w-full rounded-lg border pe-3 ps-9 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                      placeholder={ti("setupTokenPlaceholder", "x-setup-token")}
                      required
                    />
                  </div>
                </div>
              )}

              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading
                  ? ti("creatingAccount", "Creating account...")
                  : ti("createInitialAdmin", "Create initial admin")}
              </Button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
