/**
 * Authentication Context & Provider
 * Manages admin user session state
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { apiRequest } from "../services/apiClient";

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: "SUPER_ADMIN" | "APP_MANAGER" | "MARKETING_MANAGER";
  managedApps?: string[];
}

interface AuthContextType {
  user: AdminUser | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
  canManageCredentials: boolean;
  canManageTemplates: boolean;
  canViewStats: boolean;
  canManageApp: (appId: string) => boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [token, setToken] = useState<string | null>(() =>
    localStorage.getItem("admin_token"),
  );
  const [isLoading, setIsLoading] = useState(true);

  // Fetch current user on mount if token exists
  useEffect(() => {
    if (token) {
      fetchCurrentUser();
    } else {
      setIsLoading(false);
    }
  }, [token]);

  async function fetchCurrentUser() {
    try {
      const userData = await apiRequest<AdminUser>("/admin/me", token);
      setUser(userData);
    } catch (error) {
      localStorage.removeItem("admin_token");
      setToken(null);
      console.error("Failed to fetch user:", error);
    } finally {
      setIsLoading(false);
    }
  }

  async function login(email: string, password: string) {
    const data = await apiRequest<{ token: string; user: AdminUser }>(
      "/admin/login",
      null,
      {
        method: "POST",
        body: JSON.stringify({ email, password }),
      },
    );
    localStorage.setItem("admin_token", data.token);
    setToken(data.token);
    setUser(data.user);
  }

  async function signup(name: string, email: string, password: string) {
    const data = await apiRequest<{ token: string; user: AdminUser }>(
      "/admin/signup",
      null,
      {
        method: "POST",
        body: JSON.stringify({ name, email, password }),
      },
    );
    localStorage.setItem("admin_token", data.token);
    setToken(data.token);
    setUser(data.user);
  }

  async function logout() {
    if (token) {
      try {
        await apiRequest("/admin/logout", token, {
          method: "POST",
        });
      } catch (error) {
        console.error("Logout error:", error);
      }
    }
    localStorage.removeItem("admin_token");
    setToken(null);
    setUser(null);
  }

  function canManageApp(appId: string): boolean {
    if (!user) return false;
    if (user.role === "SUPER_ADMIN") return true;
    if (user.role === "APP_MANAGER" && user.managedApps?.includes(appId))
      return true;
    return false;
  }

  const value: AuthContextType = {
    user,
    token,
    isLoading,
    login,
    signup,
    logout,
    isAuthenticated: !!user,
    canManageCredentials:
      user?.role === "SUPER_ADMIN" || user?.role === "APP_MANAGER",
    canManageTemplates: !!user, // All admin roles can manage templates
    canViewStats: !!user, // All admin roles can view stats
    canManageApp,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Helper for authenticated API calls
 */
export function useAuthenticatedFetch() {
  const { token } = useAuth();

  return useCallback(
    async function authFetch<T = any>(
      endpoint: string,
      options: RequestInit = {},
    ): Promise<T> {
      return apiRequest<T>(endpoint, token, options);
    },
    [token],
  );
}
