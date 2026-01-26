/**
 * Authentication Context & Provider
 * Manages admin user session state
 */

import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export interface AdminUser {
    id: string;
    email: string;
    name: string;
    role: 'SUPER_ADMIN' | 'APP_MANAGER' | 'MARKETING_MANAGER';
    managedApps?: string[];
}

interface AuthContextType {
    user: AdminUser | null;
    token: string | null;
    isLoading: boolean;
    login: (email: string, password: string) => Promise<void>;
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
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}

interface AuthProviderProps {
    children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
    const [user, setUser] = useState<AdminUser | null>(null);
    const [token, setToken] = useState<string | null>(() => localStorage.getItem('admin_token'));
    const [isLoading, setIsLoading] = useState(true);

    // Fetch current user on mount if token exists
    useEffect(() => {
        if (token) {
            fetchCurrentUser();
        } else {
            setIsLoading(false);
        }
    }, []);

    async function fetchCurrentUser() {
        try {
            const response = await fetch(`${API_URL}/admin/me`, {
                headers: { 'Authorization': `Bearer ${token}` },
            });
            
            if (response.ok) {
                const data = await response.json();
                setUser(data);
            } else {
                // Token invalid, clear it
                localStorage.removeItem('admin_token');
                setToken(null);
            }
        } catch (error) {
            console.error('Failed to fetch user:', error);
        } finally {
            setIsLoading(false);
        }
    }

    async function login(email: string, password: string) {
        const response = await fetch(`${API_URL}/admin/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.error?.message || 'Login failed');
        }

        const data = await response.json();
        localStorage.setItem('admin_token', data.token);
        setToken(data.token);
        setUser(data.user);
    }

    async function logout() {
        if (token) {
            try {
                await fetch(`${API_URL}/admin/logout`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` },
                });
            } catch (error) {
                console.error('Logout error:', error);
            }
        }
        localStorage.removeItem('admin_token');
        setToken(null);
        setUser(null);
    }

    function canManageApp(appId: string): boolean {
        if (!user) return false;
        if (user.role === 'SUPER_ADMIN') return true;
        if (user.role === 'APP_MANAGER' && user.managedApps?.includes(appId)) return true;
        return false;
    }

    const value: AuthContextType = {
        user,
        token,
        isLoading,
        login,
        logout,
        isAuthenticated: !!user,
        canManageCredentials: user?.role === 'SUPER_ADMIN' || user?.role === 'APP_MANAGER',
        canManageTemplates: !!user, // All admin roles can manage templates
        canViewStats: !!user, // All admin roles can view stats
        canManageApp,
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
}

/**
 * Helper for authenticated API calls
 */
export function useAuthenticatedFetch() {
    const { token } = useAuth();
    const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

    return async function authFetch(endpoint: string, options: RequestInit = {}) {
        const headers: HeadersInit = {
            'Content-Type': 'application/json',
            ...(token && { 'Authorization': `Bearer ${token}` }),
            ...options.headers,
        };

        const response = await fetch(`${API_URL}${endpoint}`, { ...options, headers });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ error: 'Request failed' }));
            throw new Error(error.error?.message || error.error || 'Request failed');
        }

        return response.json();
    };
}
