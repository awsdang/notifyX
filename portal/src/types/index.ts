export interface Application {
  id: string;
  name: string;
  notificationIconAssetId?: string | null;
  notificationIconUrl?: string | null;
  androidNotificationIcon?: string | null;
  isKilled: boolean;
  createdAt: string;
  updatedAt: string;
}

// Re-export Stats from statsService for backward compat
export type { Stats } from "../services/statsService";

export interface Campaign {
  id: string;
  appId: string;
  name: string;
  description?: string;
  status: "DRAFT" | "SCHEDULED" | "PROCESSING" | "COMPLETED" | "CANCELLED" | "FAILED" | "SENT";
  targetingMode: "ALL" | "USER_LIST" | "CSV";
  totalTargets: number;
  processedCount: number;
  title: string;
  subtitle?: string;
  body: string;
  image?: string;
  actionUrl?: string | null;
  data?: Record<string, string> | null;
  actions?: Array<Record<string, unknown>> | null;
  platforms?: Array<"ios" | "android" | "huawei" | "web"> | null;
  targetUserIds?: string[] | null;
  scheduledAt?: string;
  startedAt?: string;
  completedAt?: string;
  sentCount: number;
  deliveredCount: number;
  failedCount: number;
  priority: string;
  createdAt: string;
}

export interface NotificationHistoryItem {
  id: string;
  appId: string;
  type: string;
  status: string;
  templateId?: string | null;
  campaignId?: string | null;
  payload?: {
    adhocContent?: {
      title?: string;
      subtitle?: string;
      body?: string;
      image?: string;
      icon?: string;
      actionUrl?: string;
      actions?: Array<Record<string, unknown>>;
      data?: Record<string, string>;
    };
    userIds?: string[];
    platforms?: Array<"ios" | "android" | "huawei" | "web" | string>;
    variables?: Record<string, string>;
  } | null;
  sendAt: string;
  priority: "LOW" | "NORMAL" | "HIGH" | string;
  createdBy?: string | null;
  createdAt: string;
  updatedAt: string;
  app?: {
    id: string;
    name: string;
  };
  _count?: {
    deliveries: number;
  };
  deliverySummary?: {
    totalDeliveries: number;
    delivered: number;
    failed: number;
    retry: number;
    pending: number;
    lastSentAt?: string | null;
    providers: string[];
  };
}

// Alias for components that reference App
export type App = Application;

/**
 * Versioned credential returned by backend.
 */
export interface CredentialVersion {
  id: string;
  version: number;
  isActive: boolean;
  createdAt: string;
  testRunStatus?: string;
}

export interface Credential {
  id: string;
  provider: string;
  activeVersion: {
    id: string;
    version: number;
    createdAt: string;
    createdBy?: string;
  } | null;
  versions: CredentialVersion[];
}
