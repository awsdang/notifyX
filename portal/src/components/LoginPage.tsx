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

  const inputClass =
    "w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm transition-all placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20";

  return (
    <div className="flex min-h-screen">
      {/* Left panel - branding */}
      <div className="hidden w-[45%] bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 p-12 lg:flex lg:flex-col lg:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm">
              <Bell className="h-5 w-5 text-white" />
            </div>
            <span className="text-xl font-bold text-white">NotifyX</span>
          </div>
        </div>
        <div>
          <h2 className="mb-4 text-4xl font-extrabold leading-tight text-white">
            Notification infrastructure,
            <br />
            <span className="text-blue-200">built for scale.</span>
          </h2>
          <p className="max-w-md text-base text-blue-200/80">
            Push notifications across iOS, Android, Huawei, and Web from a
            single unified platform.
          </p>
        </div>
        <p className="text-xs text-blue-300/60">NotifyX Admin Portal</p>
      </div>

      {/* Right panel - form */}
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="mb-8 text-center lg:hidden">
            <div className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700">
              <Bell className="h-6 w-6 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900">NotifyX</h1>
          </div>

          <div className="mb-2 flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-slate-900">
                {mode === "signup"
                  ? tl("createAccount", "Create Account")
                  : tl("signIn", "Welcome back")}
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                {mode === "signup"
                  ? tl("signupSubtitle", "Set up your admin account")
                  : tl("signinSubtitle", "Sign in to your admin portal")}
              </p>
            </div>
            <LanguageSelector className="scale-90" />
          </div>

          {error && (
            <div className="my-4 flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />
              <span className="text-sm text-rose-700">{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            {mode === "signup" && (
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  {tl("name", "Full Name")}
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={inputClass}
                  placeholder={tl("namePlaceholder", "Your name")}
                  required
                />
              </div>
            )}

            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                {tl("email", "Email")}
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClass}
                placeholder={tl("emailPlaceholder", "admin@example.com")}
                required
                autoComplete="email"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                {tl("password", "Password")}
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputClass}
                placeholder="Enter your password"
                required
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
              />
            </div>

            {mode === "signup" && (
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  {tl("confirmPassword", "Confirm Password")}
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className={inputClass}
                  placeholder="Confirm your password"
                  required
                  autoComplete="new-password"
                />
              </div>
            )}

            <Button
              type="submit"
              className="!mt-6 h-11 w-full rounded-xl text-sm font-semibold"
              disabled={isLoading}
            >
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

          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={() => {
                setError("");
                setMode(mode === "signup" ? "login" : "signup");
              }}
              className="text-sm text-slate-500 transition-colors hover:text-blue-600"
            >
              {mode === "signup"
                ? tl("alreadyHaveAccount", "Already have an account? Sign in")
                : tl("needInvite", "Have an invite? Create account")}
            </button>
          </div>

          {mode === "signup" && (
            <div className="mt-4 rounded-xl bg-blue-50 px-4 py-3 text-center">
              <p className="text-xs text-blue-600">
                {tl(
                  "signupInviteHint",
                  "Sign-up requires an active app invitation sent to this email.",
                )}
              </p>
            </div>
          )}

          {onSetupNeeded && (
            <div className="mt-6 border-t border-slate-100 pt-6 text-center">
              <button
                onClick={onSetupNeeded}
                className="text-sm font-medium text-blue-600 hover:text-blue-700"
              >
                {tl("createInitialAdmin", "First time? Create initial admin")}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
