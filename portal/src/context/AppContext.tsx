import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { useAppManager } from "../hooks/useAppManager";
import type { Application } from "../types";

interface AppContextType {
  apps: Application[];
  selectedApp: Application | null;
  setSelectedApp: (app: Application | null) => void;
  isLoading: boolean;
  createApp: (name: string) => Promise<void>;
  killApp: (id: string) => Promise<Application | undefined>;
  reviveApp: (id: string) => Promise<Application | undefined>;
  refetchApps: () => Promise<void>;
}

const AppContext = createContext<AppContextType | null>(null);

export function useAppContext() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error("useAppContext must be used within an AppProvider");
  }
  return context;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const { apps, isLoading, refresh, createApp, killApp, reviveApp } =
    useAppManager();

  const [selectedApp, setSelectedAppState] = useState<Application | null>(null);

  // Restore selected app from sessionStorage on mount
  useEffect(() => {
    if (apps.length === 0) return;
    const savedId = sessionStorage.getItem("selectedAppId");
    if (savedId) {
      const found = apps.find((a) => a.id === savedId);
      if (found) {
        setSelectedAppState(found);
        return;
      }
    }
    // Auto-select first app if none selected
    if (!selectedApp) {
      setSelectedAppState(apps[0]);
    }
  }, [apps]);

  // Keep selectedApp in sync with apps list (name/status changes)
  useEffect(() => {
    if (!selectedApp) return;
    const updated = apps.find((a) => a.id === selectedApp.id);
    if (!updated) {
      setSelectedAppState(apps[0] || null);
      return;
    }
    if (
      updated.name !== selectedApp.name ||
      updated.isKilled !== selectedApp.isKilled
    ) {
      setSelectedAppState(updated);
    }
  }, [apps, selectedApp]);

  const setSelectedApp = useCallback((app: Application | null) => {
    setSelectedAppState(app);
    if (app) {
      sessionStorage.setItem("selectedAppId", app.id);
    } else {
      sessionStorage.removeItem("selectedAppId");
    }
  }, []);

  return (
    <AppContext.Provider
      value={{
        apps,
        selectedApp,
        setSelectedApp,
        isLoading,
        createApp,
        killApp,
        reviveApp,
        refetchApps: refresh,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}
