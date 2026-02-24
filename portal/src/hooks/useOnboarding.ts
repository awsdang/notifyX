import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { apiRequest } from "../services/apiClient";

export interface OnboardingStatus {
    hasApps: boolean;
    hasCredentials: boolean;
    isOnboarded: boolean;
}

export function useOnboarding() {
    const { token, isAuthenticated } = useAuth();
    const [status, setStatus] = useState<OnboardingStatus>({
        hasApps: false,
        hasCredentials: false,
        isOnboarded: false,
    });
    const [isLoading, setIsLoading] = useState(true);

    const refresh = useCallback(async () => {
        if (!isAuthenticated || !token) return;
        try {
            const data = await apiRequest<OnboardingStatus>(
                "/admin/onboarding-status",
                token,
            );
            setStatus(data);
            return data;
        } catch (error) {
            console.error("Failed to fetch onboarding status:", error);
            return null;
        } finally {
            setIsLoading(false);
        }
    }, [token, isAuthenticated]);

    useEffect(() => {
        refresh();
    }, [refresh]);

    return { ...status, isLoading, refresh };
}
