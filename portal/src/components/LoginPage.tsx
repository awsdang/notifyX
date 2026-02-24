/**
 * Login Page Component
 */

import { useState } from "react";
import { Bell, LogIn, AlertCircle } from "lucide-react";
import { Button } from "./ui/button";
import { useAuth } from "../context/AuthContext";
import { LanguageSelector } from "./LanguageSelector";
import { useScopedTranslation } from "../context/I18nContext";

interface LoginPageProps {
  onSetupNeeded?: () => void;
}

export function LoginPage({ onSetupNeeded }: LoginPageProps) {
  const { login, signup } = useAuth();
  const tl = useScopedTranslation("components", "LoginPage");

  const [mode, setMode] = useState<"login" | "signup">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      if (mode === "signup") {
        if (password !== confirmPassword) {
          throw new Error(tl("passwordsDoNotMatch", "Passwords do not match"));
        }
        await signup(name, email, password);
      } else {
        await login(email, password);
      }
    } catch (err: any) {
      setError(
        err.message ||
          (mode === "signup"
            ? tl("signupFailed", "Sign up failed")
            : tl("loginFailed", "Login failed")),
      );
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
          {/* Logo */}
          <div className="mb-8 text-center">
            <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-linear-to-br from-blue-600 to-purple-600">
              <Bell className="h-8 w-8 text-white" />
            </div>
            <h1 className="bg-linear-to-r from-blue-600 to-purple-600 bg-clip-text text-3xl font-bold text-transparent">
              NotifyX
            </h1>
            <p className="mt-2 text-gray-500">{tl("adminPortal", "Admin Portal")}</p>
          </div>

          {/* Login Form */}
          <div className="rounded-2xl border bg-white p-8 shadow-xl">
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-xl font-semibold">
                {mode === "signup"
                  ? tl("createAccount", "Create Account")
                  : tl("signIn", "Sign In")}
              </h2>
              <button
                type="button"
                onClick={() => {
                  setError("");
                  setMode(mode === "signup" ? "login" : "signup");
                }}
                className="text-sm text-blue-600 hover:underline"
              >
                {mode === "signup"
                  ? tl("alreadyHaveAccount", "Already have an account?")
                  : tl("needInvite", "Have an invite? Sign up")}
              </button>
            </div>

            {error && (
              <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-red-700">
                <AlertCircle className="h-4 w-4" />
                <span className="text-sm">{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === "signup" && (
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    {tl("name", "Name")}
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full rounded-lg border px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                    placeholder={tl("namePlaceholder", "Your name")}
                    required
                  />
                </div>
              )}

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  {tl("email", "Email")}
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                  placeholder={tl("emailPlaceholder", "admin@example.com")}
                  required
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  {tl("password", "Password")}
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                  placeholder={tl("passwordPlaceholder", "••••••••")}
                  required
                />
              </div>

              {mode === "signup" && (
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    {tl("confirmPassword", "Confirm Password")}
                  </label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full rounded-lg border px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                    placeholder={tl("passwordPlaceholder", "••••••••")}
                    required
                  />
                </div>
              )}

              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? (
                  <span className="flex items-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    {mode === "signup"
                      ? tl("creatingAccountLoading", "Creating account...")
                      : tl("signingIn", "Signing in...")}
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <LogIn className="h-4 w-4" />
                    {mode === "signup"
                      ? tl("createAccount", "Create Account")
                      : tl("signIn", "Sign In")}
                  </span>
                )}
              </Button>
            </form>

            {mode === "signup" && (
              <p className="mt-4 text-xs text-slate-500">
                {tl(
                  "signupInviteHint",
                  "Sign-up requires an active app invitation sent to this email.",
                )}
              </p>
            )}

            {onSetupNeeded && (
              <div className="mt-6 border-t pt-6 text-center">
                <p className="mb-2 text-sm text-gray-500">
                  {tl("firstTimeSetup", "First time setup?")}
                </p>
                <button
                  onClick={onSetupNeeded}
                  className="text-sm text-blue-600 hover:underline"
                >
                  {tl("createInitialAdmin", "Create initial admin account")}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
