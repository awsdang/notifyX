import { Select } from "./ui/Input";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ImagePlus,
  Loader2,
  Plus,
  Upload,
  Users,
} from "lucide-react";
import { Button } from "./ui/button";
import { NotificationPreview } from "./NotificationPreview";
import { clsx } from "clsx";
import type { App } from "../types";
import { apiFetch } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useConfirmDialog } from "../context/ConfirmDialogContext";
import { useScopedTranslation } from "../context/I18nContext";
import { getUserIdentityLabel } from "../lib/userIdentity";
import { useAppTestTargetUsers } from "../hooks/useAppTestTargetUsers";
import {
  applyTemplateVariables,
  buildTemplateVariablePayload,
  groupTemplates,
  pickTemplateLanguage,
  resolveTemplateVariableKeys,
  type ApiTemplateRecord,
  type GroupedTemplate,
  type TemplateType,
} from "../lib/templateUtils";

interface SendNotificationFormProps {
  apps: App[];
}

interface SendReadiness {
  usersCount: number;
  devicesCount: number;
  hasActiveCredentials: boolean;
}

interface NotificationCreateResult {
  id?: string;
  convertedToCampaign?: boolean;
  usersCount?: number;
  threshold?: number;
  campaign?: {
    id: string;
    name: string;
    status: string;
    scheduledAt?: string | null;
  };
}

interface NotificationTemplateOption {
  key: string;
  id: string;
  label: string;
}

const MOBILE_PLATFORMS = ["ios", "android", "huawei"] as const;
const SEND_PLATFORMS = ["ios", "android", "huawei", "web"] as const;
const NOTIFICATION_TYPES = [
  "transactional",
  "marketing",
  "engagement",
  "utility",
  "campaign",
] as const;

import {
  CTA_TYPE_OPTIONS,
  type CtaType,
  DEFAULT_TAP_ACTION_TYPE,
  getDefaultCtaLabel,
  getCtaValuePlaceholder,
} from "../constants/cta";
import { buildNotificationCtaPayload } from "../lib/notificationCta";

type SendPlatform = (typeof SEND_PLATFORMS)[number];
type NotifyType = (typeof NOTIFICATION_TYPES)[number];
type SendStep = "test" | "live";
type DeliveryMode = "now" | "scheduled";

export function SendNotificationForm({ apps }: SendNotificationFormProps) {
  const { token } = useAuth();
  const ts = useScopedTranslation("components", "SendNotificationForm");
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const tt = (
    key: string,
    params?: Record<string, string | number>,
    fallback?: string,
  ) => ts(key, fallback || key, params);

  const getInitialFormData = () => ({
    appId: "",
    type: "transactional" as NotifyType,
    title: "",
    subtitle: "",
    body: "",
    tapActionType: DEFAULT_TAP_ACTION_TYPE as CtaType,
    tapActionValue: "",
    ctaType: "none" as CtaType,
    ctaLabel: "",
    ctaValue: "",
    ctaTypeSecondary: "none" as CtaType,
    ctaLabelSecondary: "",
    ctaValueSecondary: "",
    image: "",
    userIds: [] as string[],
    testUserIds: [] as string[],
    platforms: [...SEND_PLATFORMS] as SendPlatform[],
    priority: "NORMAL" as "LOW" | "NORMAL" | "HIGH",
    scheduledLocal: "",
  });

  const [step, setStep] = useState<SendStep>("test");
  const [deliveryMode, setDeliveryMode] = useState<DeliveryMode>("now");
  const [showSubtitle, setShowSubtitle] = useState(false);
  const [showTargetUsers, setShowTargetUsers] = useState(false);
  const [showSecondaryCta, setShowSecondaryCta] = useState(false);

  const [formData, setFormData] = useState(getInitialFormData);

  const [status, setStatus] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [campaignNotice, setCampaignNotice] = useState<{
    campaignId: string;
    campaignName: string;
    usersCount?: number;
    threshold?: number;
  } | null>(null);
  const [previewPlatform, setPreviewPlatform] = useState<
    "ios" | "android" | "huawei" | "web"
  >("ios");
  const [previewDirection, setPreviewDirection] = useState<"ltr" | "rtl">(
    "ltr",
  );
  const [templates, setTemplates] = useState<GroupedTemplate[]>([]);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false);
  const [selectedTemplateKey, setSelectedTemplateKey] = useState("");
  const [selectedTemplateLanguage, setSelectedTemplateLanguage] = useState("");
  const [templateVariables, setTemplateVariables] = useState<
    Record<string, string>
  >({});

  const [readiness, setReadiness] = useState<SendReadiness | null>(null);
  const [isCheckingReadiness, setIsCheckingReadiness] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const {
    allUsers: subscribedUsers,
    testTargetUsers,
    hasCustomTestTargetUsers,
    isLoading: isLoadingUsers,
    error: usersLoadError,
  } = useAppTestTargetUsers(formData.appId, token);

  const formId = "send-notification-form";
  const getNotificationTypeLabel = (value: NotifyType) => {
    const defaults: Record<NotifyType, string> = {
      transactional: "Transactional",
      marketing: "Marketing",
      engagement: "Engagement",
      utility: "Utility",
      campaign: "Campaign",
    };
    return tt(`type_${value}`, undefined, defaults[value]);
  };

  const getCtaTypeLabel = (value: CtaType) => {
    const opt = CTA_TYPE_OPTIONS.find((o) => o.value === value);
    return tt(`ctaType_${value}`, undefined, opt?.label || value);
  };

  const getPlatformLabel = (platform: SendPlatform) => {
    const defaults: Record<SendPlatform, string> = {
      ios: "iOS",
      android: "Android",
      huawei: "Huawei",
      web: "Web",
    };
    return tt(`platform_${platform}`, undefined, defaults[platform]);
  };

  const getTargetUserOptionLabel = (user: (typeof subscribedUsers)[number]) =>
    `${getUserIdentityLabel(user)} (${user.devicesCount} devices)`;

  useEffect(() => {
    if (step === "test") {
      setDeliveryMode("now");
    }
  }, [step]);

  useEffect(() => {
    if (!formData.appId || !token) {
      setReadiness(null);
      return;
    }

    let mounted = true;

    const checkReadiness = async () => {
      setIsCheckingReadiness(true);
      try {
        const [usersData, devicesData] = await Promise.all([
          apiFetch<{ pagination: { total: number } }>(
            `/users?appId=${formData.appId}&page=1&limit=1`,
            {},
            token,
          ),
          apiFetch<{ pagination: { total: number } }>(
            `/devices?appId=${formData.appId}&isActive=true&page=1&limit=1`,
            {},
            token,
          ),
        ]);

        const envs = ["PROD", "UAT"] as const;
        let hasActiveCredentials = false;

        for (const env of envs) {
          try {
            const creds = await apiFetch<any[]>(
              `/apps/${formData.appId}/env/${env}/credentials`,
              {},
              token,
            );
            if (Array.isArray(creds) && creds.some((c) => c.activeVersion)) {
              hasActiveCredentials = true;
              break;
            }
          } catch {
            // Ignore missing env credentials.
          }
        }

        if (!mounted) return;
        setReadiness({
          usersCount: usersData.pagination?.total || 0,
          devicesCount: devicesData.pagination?.total || 0,
          hasActiveCredentials,
        });
      } finally {
        if (mounted) setIsCheckingReadiness(false);
      }
    };

    void checkReadiness();

    return () => {
      mounted = false;
    };
  }, [formData.appId, token]);

  useEffect(() => {
    const allUserIds = new Set(subscribedUsers.map((user) => user.externalUserId));
    const testUserIds = new Set(testTargetUsers.map((user) => user.externalUserId));

    setFormData((prev) => {
      const nextUserIds = prev.userIds.filter((id) => allUserIds.has(id));
      const nextTestUserIds = prev.testUserIds.filter((id) => testUserIds.has(id));
      const userIdsChanged =
        nextUserIds.length !== prev.userIds.length ||
        nextUserIds.some((id, index) => id !== prev.userIds[index]);
      const testUserIdsChanged =
        nextTestUserIds.length !== prev.testUserIds.length ||
        nextTestUserIds.some((id, index) => id !== prev.testUserIds[index]);

      if (!userIdsChanged && !testUserIdsChanged) {
        return prev;
      }

      return {
        ...prev,
        userIds: nextUserIds,
        testUserIds: nextTestUserIds,
      };
    });
  }, [subscribedUsers, testTargetUsers]);

  useEffect(() => {
    if (!formData.appId || !token) {
      setTemplates([]);
      setSelectedTemplateKey("");
      setSelectedTemplateLanguage("");
      setTemplateVariables({});
      setIsLoadingTemplates(false);
      return;
    }

    let mounted = true;

    const loadTemplates = async () => {
      setIsLoadingTemplates(true);
      try {
        const records = await apiFetch<ApiTemplateRecord[]>(
          `/templates?appId=${encodeURIComponent(formData.appId)}`,
          {},
          token,
        );
        if (!mounted) return;
        setTemplates(groupTemplates(Array.isArray(records) ? records : []));
      } catch {
        if (!mounted) return;
        setTemplates([]);
      } finally {
        if (mounted) setIsLoadingTemplates(false);
      }
    };

    void loadTemplates();

    return () => {
      mounted = false;
    };
  }, [formData.appId, token]);

  const ctaNeedsValue = useMemo(() => {
    return CTA_TYPE_OPTIONS.find((opt) => opt.value === formData.ctaType)
      ?.needsValue;
  }, [formData.ctaType]);

  const secondaryCtaNeedsValue = useMemo(() => {
    return CTA_TYPE_OPTIONS.find(
      (opt) => opt.value === formData.ctaTypeSecondary,
    )?.needsValue;
  }, [formData.ctaTypeSecondary]);

  const preferredTemplateType: TemplateType =
    formData.type === "campaign" ? "campaign" : "transactional";

  const availableTemplates = useMemo(
    () => templates.filter((template) => template.type === preferredTemplateType),
    [templates, preferredTemplateType],
  );

  const templateOptions = useMemo<NotificationTemplateOption[]>(
    () =>
      availableTemplates.map((template) => ({
        key: template.key,
        id: template.id,
        label: template.name,
      })),
    [availableTemplates],
  );

  const selectedTemplate = useMemo(
    () =>
      availableTemplates.find((template) => template.key === selectedTemplateKey) ||
      null,
    [availableTemplates, selectedTemplateKey],
  );

  useEffect(() => {
    if (!selectedTemplate) {
      setSelectedTemplateLanguage("");
      return;
    }

    const nextLanguage = pickTemplateLanguage(
      selectedTemplate,
      selectedTemplateLanguage,
    );
    if (nextLanguage !== selectedTemplateLanguage) {
      setSelectedTemplateLanguage(nextLanguage);
    }
  }, [selectedTemplate, selectedTemplateLanguage]);

  useEffect(() => {
    if (!selectedTemplate) {
      setTemplateVariables({});
    }
  }, [selectedTemplate]);

  const selectedTemplateVariant = useMemo(() => {
    if (!selectedTemplate || !selectedTemplateLanguage) return null;
    return selectedTemplate.variantsByLanguage[selectedTemplateLanguage] || null;
  }, [selectedTemplate, selectedTemplateLanguage]);

  const templateVariableKeys = useMemo(
    () => resolveTemplateVariableKeys(selectedTemplate, selectedTemplateLanguage),
    [selectedTemplate, selectedTemplateLanguage],
  );

  const templateVariablesPayload = useMemo(
    () => buildTemplateVariablePayload(templateVariableKeys, templateVariables),
    [templateVariableKeys, templateVariables],
  );

  useEffect(() => {
    if (!selectedTemplateVariant) return;

    const nextTitle = applyTemplateVariables(
      selectedTemplateVariant.title,
      templateVariablesPayload,
    );
    const nextSubtitle = applyTemplateVariables(
      selectedTemplateVariant.subtitle,
      templateVariablesPayload,
    );
    const nextBody = applyTemplateVariables(
      selectedTemplateVariant.body,
      templateVariablesPayload,
    );

    setFormData((prev) => {
      if (
        prev.title === nextTitle &&
        prev.subtitle === nextSubtitle &&
        prev.body === nextBody
      ) {
        return prev;
      }
      return {
        ...prev,
        title: nextTitle,
        subtitle: nextSubtitle,
        body: nextBody,
      };
    });
    setShowSubtitle(Boolean(selectedTemplateVariant.subtitle?.trim()));
  }, [selectedTemplateVariant, templateVariablesPayload]);

  useEffect(() => {
    if (!selectedTemplateKey) return;
    if (!availableTemplates.some((template) => template.key === selectedTemplateKey)) {
      setSelectedTemplateKey("");
      setSelectedTemplateLanguage("");
      setTemplateVariables({});
    }
  }, [availableTemplates, selectedTemplateKey]);

  const targetUserIds =
    step === "test" ? formData.testUserIds : formData.userIds;

  const readinessErrors = useMemo(() => {
    if (!formData.appId || !readiness) return [] as string[];
    const errors: string[] = [];

    if (!readiness.hasActiveCredentials) {
      errors.push(
        tt("No active provider credentials found for this app."),
      );
    }
    if (readiness.devicesCount === 0) {
      errors.push(tt("No active devices are registered for this app."));
    }
    if (formData.platforms.length === 0) {
      errors.push(tt("Select at least one platform."));
    }
    if (
      (formData.tapActionType === "open_url" ||
        formData.tapActionType === "deep_link") &&
      !formData.tapActionValue.trim()
    ) {
      errors.push(
        formData.tapActionType === "deep_link"
          ? tt("Deep link URI is required.")
          : tt("URL is required when tap action is Open URL."),
      );
    }
    if (step === "test" && formData.testUserIds.length === 0) {
      errors.push(
        tt("Test notification requires at least one target user."),
      );
    }
    if (
      step === "live" &&
      deliveryMode === "scheduled" &&
      !formData.scheduledLocal
    ) {
      errors.push(tt("Set date and time for scheduled live notification."));
    }

    return errors;
  }, [
    deliveryMode,
    formData.appId,
    formData.platforms.length,
    formData.scheduledLocal,
    formData.tapActionType,
    formData.tapActionValue,
    formData.testUserIds.length,
    readiness,
    step,
  ]);

  const hasRequiredContent = selectedTemplateVariant
    ? Boolean(selectedTemplateVariant.title.trim()) &&
      Boolean(selectedTemplateVariant.body.trim())
    : Boolean(formData.title.trim()) && Boolean(formData.body.trim());

  const needsActionUrl =
    formData.tapActionType === "open_url" ||
    formData.tapActionType === "deep_link";
  const canSubmit =
    !!formData.appId &&
    hasRequiredContent &&
    (!needsActionUrl || Boolean(formData.tapActionValue.trim())) &&
    readinessErrors.length === 0 &&
    !isSubmitting;

  const inputClass =
    "w-full h-12 px-4 border border-slate-200 rounded-xl text-sm bg-white text-slate-900";

  const togglePlatform = (platform: SendPlatform) => {
    setFormData((prev) => ({
      ...prev,
      platforms: prev.platforms.includes(platform)
        ? prev.platforms.filter((value) => value !== platform)
        : [...prev.platforms, platform],
    }));
  };

  const handleImageUpload = async (file: File) => {
    if (!token) return;

    setIsUploadingImage(true);
    setStatus(null);

    try {
      const body = new FormData();
      body.append("file", file);

      const base = (
        import.meta.env.VITE_API_URL || "http://localhost:3000"
      ).replace(/\/$/, "");
      const endpoint = base.endsWith("/api/v1")
        ? `${base}/uploads`
        : `${base}/api/v1/uploads`;

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body,
      });

      const json = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(json?.message || tt("Image upload failed"));
      }

      const url = json?.data?.url as string;
      if (!url) throw new Error(tt("Image upload did not return a URL"));

      setFormData((prev) => ({ ...prev, image: url }));
    } catch (error: any) {
      setStatus({
        type: "error",
        message: error?.message || tt("Failed to upload image"),
      });
    } finally {
      setIsUploadingImage(false);
    }
  };

  const removeUploadedImage = () => {
    setFormData((prev) => ({ ...prev, image: "" }));
    setStatus(null);
  };

  const resetComposer = () => {
    setStep("test");
    setDeliveryMode("now");
    setShowSubtitle(false);
    setShowTargetUsers(false);
    setShowSecondaryCta(false);
    setPreviewPlatform("ios");
    setPreviewDirection("ltr");
    setReadiness(null);
    setTemplates([]);
    setSelectedTemplateKey("");
    setSelectedTemplateLanguage("");
    setTemplateVariables({});
    setStatus(null);
    setCampaignNotice(null);
    setFormData(getInitialFormData());
  };

  const { confirm } = useConfirmDialog();

  const sendNotification = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || !token) return;

    // Confirm before live send
    if (step === "live") {
      const targetDesc = showTargetUsers && formData.userIds.length > 0
        ? `${formData.userIds.length} specific users`
        : "all users";
      const confirmed = await confirm({
        title: deliveryMode === "scheduled" ? "Schedule Live Notification?" : "Send Live Notification?",
        description: `This will ${deliveryMode === "scheduled" ? "schedule" : "immediately send"} a notification to ${targetDesc} on ${formData.platforms.join(", ")}.`,
        confirmText: deliveryMode === "scheduled" ? "Schedule" : "Send Now",
        destructive: true,
      });
      if (!confirmed) return;
    }

    setStatus(null);
    setIsSubmitting(true);

    try {
      const ctaPayload = buildNotificationCtaPayload({
        tapActionType: formData.tapActionType,
        tapActionValue: formData.tapActionValue,
        ctas: [
          {
            type: formData.ctaType,
            label: formData.ctaLabel,
            value: formData.ctaValue,
            dataSuffix: "",
          },
          ...(showSecondaryCta
            ? [
                {
                  type: formData.ctaTypeSecondary,
                  label: formData.ctaLabelSecondary,
                  value: formData.ctaValueSecondary,
                  dataSuffix: "Secondary" as const,
                },
              ]
            : []),
        ],
      });

      const sendAt =
        step === "live" &&
        deliveryMode === "scheduled" &&
        formData.scheduledLocal
          ? new Date(formData.scheduledLocal).toISOString()
          : undefined;

      const result = await apiFetch<NotificationCreateResult>(
        "/notifications",
        {
          method: "POST",
          body: JSON.stringify({
            appId: formData.appId,
            type: formData.type,
            templateId: selectedTemplateVariant?.id || undefined,
            variables: selectedTemplateVariant
              ? templateVariablesPayload
              : undefined,
            title: selectedTemplateVariant ? undefined : formData.title,
            subtitle: selectedTemplateVariant
              ? undefined
              : showSubtitle
                ? formData.subtitle || undefined
                : undefined,
            body: selectedTemplateVariant ? undefined : formData.body,
            image: formData.image || undefined,
            tapActionType: ctaPayload.tapActionType,
            actionUrl: ctaPayload.actionUrl,
            data: ctaPayload.data,
            actions: ctaPayload.actions,
            priority: formData.priority,
            userIds: targetUserIds.length > 0 ? targetUserIds : undefined,
            platforms:
              formData.platforms.length > 0 ? formData.platforms : undefined,
            sendAt,
          }),
        },
        token,
      );

      if (result?.convertedToCampaign && result.campaign?.id) {
        setCampaignNotice({
          campaignId: result.campaign.id,
          campaignName: result.campaign.name,
          usersCount: result.usersCount,
          threshold: result.threshold,
        });
        setStatus({
          type: "success",
          message: tt(
            "Large all-user send was converted into a campaign for safe batched delivery.",
          ),
        });
      } else {
        setCampaignNotice(null);
        setStatus({
          type: "success",
          message:
            step === "test"
              ? tt("Test notification queued.")
              : deliveryMode === "scheduled"
                ? tt("Live notification scheduled.")
                : tt("Live notification queued."),
        });
      }
    } catch (error: any) {
      setCampaignNotice(null);
      setStatus({
        type: "error",
        message: error?.message || tt("Failed to send notification"),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (apps.length === 0) {
    return (
      <div className="bg-white border border-amber-200 rounded-2xl p-8 flex items-start gap-4">
        <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5" />
        <div>
          <h3 className="font-semibold text-amber-800">
            {tt("Send is locked")}
          </h3>
          <p className="text-sm text-amber-700 mt-1">
            {tt("Create at least one app before opening Send Notification.")}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      <div
        className={clsx(
          "p-8 rounded-2xl border shadow-sm bg-white",
          step === "test" ? "border-emerald-200" : "border-rose-200",
        )}
      >
        <div className="flex items-center justify-between mb-6 gap-3">
          <h3 className="text-2xl font-semibold">
            {tt("Compose Notification")}
          </h3>
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-xl bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => setStep("test")}
                className={clsx(
                  "px-3 py-1.5 text-sm font-bold rounded-lg",
                  step === "test"
                    ? "bg-emerald-600 text-white"
                    : "text-slate-600",
                )}
              >
                {tt("Test")}
              </button>
              <button
                type="button"
                onClick={() => setStep("live")}
                className={clsx(
                  "px-3 py-1.5 text-sm font-bold rounded-lg",
                  step === "live" ? "bg-rose-600 text-white" : "text-slate-600",
                )}
              >
                {tt("Live")}
              </button>
            </div>
          </div>
        </div>

        <form
          id={formId}
          onSubmit={sendNotification}
          className="flex flex-col gap-5"
        >
          <div>
            <label className="block text-sm font-semibold mb-2">
              {tt("App")}
            </label>
            <Select
              className={inputClass}
              value={formData.appId}
              onChange={(e) => {
                setSelectedTemplateKey("");
                setSelectedTemplateLanguage("");
                setTemplateVariables({});
                setFormData((prev) => ({
                  ...prev,
                  appId: e.target.value,
                  userIds: [],
                  testUserIds: [],
                }));
              }}
            >
              <option value="">{tt("Select an app")}</option>
              {apps.map((app) => (
                <option key={app.id} value={app.id}>
                  {app.name}
                </option>
              ))}
            </Select>
          </div>

          <div className="rounded-xl border border-slate-200 p-4 bg-slate-50">
            <div className="text-base font-semibold text-slate-700 mb-2">
              {tt("Readiness checks")}
            </div>
            {isCheckingReadiness ? (
              <div className="text-sm text-slate-500 flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />{" "}
                {tt("Checking app setup...")}
              </div>
            ) : readiness ? (
              <div className="space-y-1.5 text-sm">
                <div className="flex items-center gap-2">
                  {readiness.hasActiveCredentials ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-amber-600" />
                  )}
                  {tt("Active provider credentials")}
                </div>
                <div className="flex items-center gap-2">
                  {readiness.devicesCount > 0 ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-amber-600" />
                  )}
                  {tt("Registered users: {{usersCount}} | Active devices: {{devicesCount}}", {
                    usersCount: readiness.usersCount,
                    devicesCount: readiness.devicesCount,
                  })}
                </div>
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={resetComposer}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100"
          >
            {tt("Reset form")}
          </button>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-slate-700">
                {tt("Category")}
              </label>
              <Select
                className={inputClass}
                value={formData.type}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    type: e.target.value as NotifyType,
                  }))
                }
              >
                {NOTIFICATION_TYPES.map((value) => (
                  <option key={value} value={value}>
                    {getNotificationTypeLabel(value)}
                  </option>
                ))}
              </Select>
              <p className="mt-1 text-[11px] text-slate-400">
                {formData.type === "transactional" && tt("Triggered by user action (order, password reset)")}
                {formData.type === "marketing" && tt("Promotional content, offers, announcements")}
                {formData.type === "engagement" && tt("Re-engage inactive users")}
                {formData.type === "utility" && tt("Updates, reminders, status changes")}
                {formData.type === "campaign" && tt("Scheduled batch delivery")}
              </p>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-slate-700">
                {tt("Priority")}
              </label>
              <Select
                className={inputClass}
                value={formData.priority}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    priority: e.target.value as "LOW" | "NORMAL" | "HIGH",
                  }))
                }
              >
                <option value="LOW">{tt("Low")} - {tt("batch delivery, non-urgent")}</option>
                <option value="NORMAL">{tt("Normal")} - {tt("standard delivery")}</option>
                <option value="HIGH">{tt("High")} - {tt("immediate, may wake device")}</option>
              </Select>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 p-4 bg-slate-50 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-slate-800">
                {tt("Template")}
              </p>
              {selectedTemplateVariant && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedTemplateKey("");
                    setSelectedTemplateLanguage("");
                    setTemplateVariables({});
                  }}
                  className="text-xs font-semibold text-slate-600 hover:text-slate-900"
                >
                  {tt("Clear template")}
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold mb-2 text-slate-600">
                  {tt("Template")}
                </label>
                <Select
                  className={inputClass}
                  value={selectedTemplateKey}
                  onChange={(e) => {
                    const nextKey = e.target.value;
                    setSelectedTemplateKey(nextKey);
                    setTemplateVariables({});
                    if (!nextKey) {
                      setSelectedTemplateLanguage("");
                    }
                  }}
                  disabled={isLoadingTemplates || !formData.appId}
                >
                  <option value="">
                    {isLoadingTemplates
                      ? tt("Loading templates...")
                      : templateOptions.length > 0
                        ? tt("No template (manual content)")
                        : tt("No templates available")}
                  </option>
                  {templateOptions.map((template) => (
                    <option key={template.key} value={template.key}>
                      {template.label}
                    </option>
                  ))}
                </Select>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-2 text-slate-600">
                  {tt("Language")}
                </label>
                <Select
                  className={inputClass}
                  value={selectedTemplateLanguage}
                  onChange={(e) => setSelectedTemplateLanguage(e.target.value)}
                  disabled={!selectedTemplate}
                >
                  {!selectedTemplate && (
                    <option value="">{tt("Select template first")}</option>
                  )}
                  {selectedTemplate?.availableLanguages.map((language) => (
                    <option key={language} value={language}>
                      {language.toUpperCase()}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            {selectedTemplateVariant && templateVariableKeys.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-slate-600 mb-2">
                  {tt("Variables")}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {templateVariableKeys.map((key) => (
                    <div key={key}>
                      <label className="block text-xs font-medium text-slate-500 mb-1">
                        {`{{${key}}}`}
                      </label>
                      <input
                        type="text"
                        className={inputClass}
                        value={templateVariables[key] || ""}
                        onChange={(e) =>
                          setTemplateVariables((prev) => ({
                            ...prev,
                            [key]: e.target.value,
                          }))
                        }
                        placeholder={tt("Value for {{key}}", { key })}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {selectedTemplateVariant && (
              <p className="text-xs text-slate-500">
                {tt(
                  "Title, subtitle, and body are driven by the selected template. Update values above to personalize placeholders.",
                )}
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-semibold mb-2">
              {tt("Target platforms")}
            </label>
            <div className="flex flex-wrap gap-2">
              {SEND_PLATFORMS.map((platform) => {
                const isActive = formData.platforms.includes(platform);
                return (
                  <button
                    type="button"
                    key={platform}
                    onClick={() => togglePlatform(platform)}
                    className={clsx(
                      "px-3 py-1.5 text-sm font-semibold rounded-lg border",
                      isActive
                        ? "bg-indigo-600 text-white border-indigo-600"
                        : "bg-white text-slate-600 border-slate-200",
                    )}
                  >
                    {getPlatformLabel(platform)}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-semibold">
                {tt("Title")}
              </label>
              {!showSubtitle && !selectedTemplateVariant && (
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600"
                  onClick={() => setShowSubtitle(true)}
                >
                  <Plus className="w-3.5 h-3.5" /> {tt("Add subtitle")}
                </button>
              )}
            </div>
            <input
              type="text"
              className={inputClass}
              value={formData.title}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, title: e.target.value }))
              }
              placeholder={
                selectedTemplateVariant
                  ? tt("Generated from template")
                  : tt("E.g. Summer Sale!")
              }
              disabled={Boolean(selectedTemplateVariant)}
            />
          </div>

          {showSubtitle && (
            <div>
              <label className="block text-sm font-semibold mb-2">
                {tt("Subtitle")}
              </label>
              <input
                type="text"
                className={inputClass}
                value={formData.subtitle}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, subtitle: e.target.value }))
                }
                placeholder={
                  selectedTemplateVariant
                    ? tt("Generated from template")
                    : tt("E.g. Limited time")
                }
                disabled={Boolean(selectedTemplateVariant)}
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-semibold mb-2">
              {tt("Body")}
            </label>
            <textarea
              className="w-full p-4 border border-slate-200 rounded-xl text-sm h-36 disabled:bg-slate-50 disabled:text-slate-500"
              value={formData.body}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, body: e.target.value }))
              }
              placeholder={
                selectedTemplateVariant
                  ? tt("Generated from template")
                  : tt("Your message goes here...")
              }
              disabled={Boolean(selectedTemplateVariant)}
            />
          </div>

          <div className="space-y-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
              <p className="mb-3 text-sm font-semibold text-slate-700">
                {tt("Tap Action")}
              </p>
              <p className="mb-3 text-xs text-slate-500">
                {tt("What happens when the user taps the notification.")}
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-600">
                    {tt("Action")}
                  </label>
                  <Select
                    className={inputClass}
                    value={formData.tapActionType}
                    onChange={(e) => {
                      const newType = e.target.value as CtaType;
                      setFormData((prev) => ({
                        ...prev,
                        tapActionType: newType,
                        ...(CTA_TYPE_OPTIONS.find((option) => option.value === newType)
                          ?.needsValue
                          ? {}
                          : { tapActionValue: "" }),
                      }));
                    }}
                  >
                    {CTA_TYPE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {getCtaTypeLabel(option.value)}
                      </option>
                    ))}
                  </Select>
                </div>
                {formData.tapActionType === "open_url" ||
                formData.tapActionType === "deep_link" ? (
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-slate-600">
                      {formData.tapActionType === "deep_link"
                        ? tt("Deep Link URI")
                        : tt("URL")}
                    </label>
                    <input
                      type={formData.tapActionType === "open_url" ? "url" : "text"}
                      className={inputClass}
                      value={formData.tapActionValue}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          tapActionValue: e.target.value,
                        }))
                      }
                      placeholder={getCtaValuePlaceholder(formData.tapActionType)}
                    />
                  </div>
                ) : null}
              </div>
              {formData.tapActionType === "open_app" && (
                <p className="mt-2 text-xs text-slate-400">
                  {tt("Tapping uses the app default action from App Settings.")}
                </p>
              )}
              {formData.tapActionType === "dismiss" && (
                <p className="mt-2 text-xs text-slate-400">
                  {tt("Notification is dismissed without opening the app.")}
                </p>
              )}
              {formData.tapActionType === "none" && (
                <p className="mt-2 text-xs text-slate-400">
                  {tt("No tap action will run when the notification body is pressed.")}
                </p>
              )}
            </div>

            <>
              <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
                <p className="mb-1 text-sm font-semibold text-slate-700">
                  {tt("Action Buttons")}
                  <span className="ml-1.5 text-xs font-normal text-slate-400">{tt("optional")}</span>
                </p>
                <p className="mb-3 text-xs text-slate-500">
                  {tt("Extra buttons shown on the expanded notification (up to 2).")}
                </p>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-slate-600">
                      {tt("CTA Type")}
                    </label>
                    <Select
                      className={inputClass}
                      value={formData.ctaType}
                      onChange={(e) => {
                        const nextType = e.target.value as CtaType;
                        setFormData((prev) => ({
                          ...prev,
                          ctaType: nextType,
                          ctaLabel: getDefaultCtaLabel(nextType),
                          ...(CTA_TYPE_OPTIONS.find((option) => option.value === nextType)
                            ?.needsValue
                            ? {}
                            : { ctaValue: "" }),
                        }));
                      }}
                    >
                      {CTA_TYPE_OPTIONS.map((option) => (
                        <option key={`primary-${option.value}`} value={option.value}>
                          {getCtaTypeLabel(option.value)}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-slate-600">
                      {tt("CTA Label")}
                    </label>
                    <input
                      type="text"
                      className={inputClass}
                      value={formData.ctaLabel}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          ctaLabel: e.target.value,
                        }))
                      }
                      placeholder={tt(getDefaultCtaLabel(formData.ctaType) || "CTA label")}
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-slate-600">
                      {formData.ctaType === "deep_link" ? tt("CTA URI") : tt("CTA URL")}
                    </label>
                    <input
                      type={formData.ctaType === "open_url" ? "url" : "text"}
                      className={inputClass}
                      value={formData.ctaValue}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          ctaValue: e.target.value,
                        }))
                      }
                      disabled={!ctaNeedsValue}
                      placeholder={getCtaValuePlaceholder(formData.ctaType)}
                    />
                  </div>
                </div>
              </div>

              {showSecondaryCta ? (
                  <div className="rounded-xl border border-slate-200 p-4 bg-slate-50">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-sm font-semibold text-slate-700">
                        {tt("CTA Button 2 (optional)")}
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setShowSecondaryCta(false);
                          setFormData((prev) => ({
                            ...prev,
                            ctaTypeSecondary: "none",
                            ctaLabelSecondary: "",
                            ctaValueSecondary: "",
                          }));
                        }}
                        className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-rose-200 text-rose-700 bg-white hover:bg-rose-50"
                      >
                        {tt("Delete")}
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs font-semibold mb-2">
                          {tt("CTA Type")}
                        </label>
                        <Select
                          className={inputClass}
                          value={formData.ctaTypeSecondary}
                          onChange={(e) => {
                            const nextType = e.target.value as CtaType;
                            setFormData((prev) => ({
                              ...prev,
                              ctaTypeSecondary: nextType,
                              ctaLabelSecondary: getDefaultCtaLabel(nextType),
                              ...(CTA_TYPE_OPTIONS.find((option) => option.value === nextType)
                                ?.needsValue
                                ? {}
                                : { ctaValueSecondary: "" }),
                            }));
                          }}
                        >
                          {CTA_TYPE_OPTIONS.map((option) => (
                            <option
                              key={`secondary-${option.value}`}
                              value={option.value}
                            >
                              {getCtaTypeLabel(option.value)}
                            </option>
                          ))}
                        </Select>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold mb-2">
                          {tt("CTA Label")}
                        </label>
                        <input
                          type="text"
                          className={inputClass}
                          value={formData.ctaLabelSecondary}
                          onChange={(e) =>
                            setFormData((prev) => ({
                              ...prev,
                              ctaLabelSecondary: e.target.value,
                            }))
                          }
                          placeholder={tt(getDefaultCtaLabel(formData.ctaTypeSecondary) || "Learn more")}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold mb-2">
                          {formData.ctaTypeSecondary === "deep_link"
                            ? tt("CTA URI")
                            : tt("CTA URL")}
                        </label>
                        <input
                          type={
                            formData.ctaTypeSecondary === "open_url"
                              ? "url"
                              : "text"
                          }
                          className={inputClass}
                          value={formData.ctaValueSecondary}
                          onChange={(e) =>
                            setFormData((prev) => ({
                              ...prev,
                              ctaValueSecondary: e.target.value,
                            }))
                          }
                          disabled={!secondaryCtaNeedsValue}
                          placeholder={getCtaValuePlaceholder(formData.ctaTypeSecondary)}
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowSecondaryCta(true)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    {tt("Add second CTA button")}
                  </button>
                )}
            </>
          </div>

          <div>
            <label className="block text-sm font-semibold mb-2">
              {tt("Image (via upload)")}
            </label>
            <div className="w-full border border-dashed border-slate-300 rounded-xl p-4 bg-slate-50">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  {formData.image ? (
                    <img
                      src={formData.image}
                      alt="Notification upload preview"
                      className="w-14 h-14 rounded-lg object-cover border border-slate-200 bg-white"
                    />
                  ) : (
                    <div className="w-14 h-14 rounded-lg border border-slate-200 bg-white flex items-center justify-center">
                      <ImagePlus className="w-5 h-5 text-slate-500" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-700">
                      {formData.image
                        ? tt("Image uploaded")
                        : tt("Upload notification image")}
                    </p>
                    <p className="text-xs text-slate-500">
                      {formData.image
                        ? tt("Ready to send with this notification")
                        : tt("PNG/JPG up to 5MB")}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => imageInputRef.current?.click()}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-indigo-700 border border-indigo-200 rounded-lg bg-white hover:bg-indigo-50"
                    disabled={isUploadingImage}
                  >
                    {isUploadingImage ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Upload className="w-3.5 h-3.5" />
                    )}
                    {isUploadingImage
                      ? tt("Uploading...")
                      : formData.image
                        ? tt("Replace")
                        : tt("Choose")}
                  </button>
                  {formData.image && (
                    <button
                      type="button"
                      onClick={removeUploadedImage}
                      className="px-3 py-1.5 text-xs font-semibold text-rose-700 border border-rose-200 rounded-lg bg-white hover:bg-rose-50"
                    >
                      {tt("Delete")}
                    </button>
                  )}
                </div>
              </div>
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleImageUpload(file);
                  e.currentTarget.value = "";
                }}
              />
            </div>
          </div>

          <div
            className={clsx(
              "rounded-xl border p-4",
              step === "test"
                ? "border-emerald-200 bg-emerald-50"
                : "border-rose-200 bg-rose-50",
            )}
          >
            <div className="font-semibold text-sm mb-2">
              {step === "test"
                ? tt("Test notification target")
                : tt("Live notification targets")}
            </div>

            {step === "test" ? (
              <div>
                <label className="block text-xs font-semibold mb-2">
                  {tt("Target User IDs (required)")}
                </label>
                <select
                  multiple
                  className="w-full min-h-36 border border-slate-200 rounded-lg p-2 text-sm bg-white"
                  value={formData.testUserIds}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      testUserIds: Array.from(e.target.selectedOptions).map(
                        (option) => option.value,
                      ),
                    }))
                  }
                >
                  {testTargetUsers.length === 0 ? (
                    <option disabled value="">
                      {isLoadingUsers
                        ? tt("Loading users...")
                        : hasCustomTestTargetUsers
                          ? tt("No preferred test users available for this app.")
                          : tt("No users with active devices")}
                    </option>
                  ) : (
                    testTargetUsers.map((user) => (
                      <option
                        key={user.externalUserId}
                        value={user.externalUserId}
                      >
                        {getTargetUserOptionLabel(user)}
                      </option>
                    ))
                  )}
                </select>
                {hasCustomTestTargetUsers && (
                  <p className="mt-2 text-xs text-emerald-800">
                    {tt(
                      "Showing only preferred test users configured in Users & Devices.",
                    )}
                  </p>
                )}
              </div>
            ) : (
              <div>
                <button
                  type="button"
                  onClick={() => setShowTargetUsers((prev) => !prev)}
                  className="inline-flex items-center gap-2 text-sm font-semibold text-rose-700"
                >
                  <Users className="w-4 h-4" />
                  {showTargetUsers
                    ? tt("Hide optional target users")
                    : tt("Target specific users (optional)")}
                </button>
                {showTargetUsers && (
                  <div className="mt-3">
                    <select
                      multiple
                      className="w-full min-h-36 border border-slate-200 rounded-lg p-2 text-sm bg-white"
                      value={formData.userIds}
                      onChange={(e) => {
                        const selected = Array.from(
                          e.target.selectedOptions,
                        ).map((option) => option.value);
                        setFormData((prev) => ({ ...prev, userIds: selected }));
                      }}
                    >
                      {subscribedUsers.map((user) => (
                        <option
                          key={user.externalUserId}
                          value={user.externalUserId}
                        >
                          {getTargetUserOptionLabel(user)}
                        </option>
                      ))}
                    </select>
                    <p className="mt-2 text-xs text-slate-600">
                      {tt("Leave empty to broadcast to all subscribed users.")}
                    </p>
                  </div>
                )}
              </div>
            )}

            {isLoadingUsers && (
              <p className="text-xs text-slate-500 mt-2">
                {tt("Loading subscribed users...")}
              </p>
            )}
            {usersLoadError && (
              <p className="text-xs text-rose-600 mt-2">{usersLoadError}</p>
            )}

            {step === "live" &&
              (!showTargetUsers || formData.userIds.length === 0) &&
              (readiness?.usersCount || 0) > 5000 && (
                <p className="text-xs text-blue-700 mt-2">
                  {tt(
                    "Large all-user broadcast detected. This will be auto-created as a campaign for batched delivery.",
                  )}
                </p>
              )}
          </div>

          <div>
            <div className="text-sm font-semibold mb-2">{tt("Delivery")}</div>
            <div className="inline-flex rounded-xl bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => setDeliveryMode("now")}
                className={clsx(
                  "px-3 py-1.5 text-sm font-bold rounded-lg",
                  deliveryMode === "now"
                    ? "bg-white shadow-sm"
                    : "text-slate-600",
                )}
              >
                {tt("Now")}
              </button>
              <button
                type="button"
                onClick={() => setDeliveryMode("scheduled")}
                disabled={step === "test"}
                className={clsx(
                  "px-3 py-1.5 text-sm font-bold rounded-lg",
                  deliveryMode === "scheduled"
                    ? "bg-white shadow-sm"
                    : "text-slate-600",
                  step === "test" && "opacity-40 cursor-not-allowed",
                )}
              >
                {tt("Set time")}
              </button>
            </div>

            {step === "live" && deliveryMode === "scheduled" && (
              <div className="mt-3">
                <input
                  type="datetime-local"
                  className={inputClass}
                  value={formData.scheduledLocal}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      scheduledLocal: e.target.value,
                    }))
                  }
                />
              </div>
            )}
          </div>

          {readinessErrors.length > 0 && (
            <div className="p-3 rounded-md text-sm bg-amber-50 text-amber-700 border border-amber-200">
              {readinessErrors.map((error) => (
                <div key={error}>- {error}</div>
              ))}
            </div>
          )}

          {status && (
            <div
              className={clsx(
                "p-3 rounded-md text-sm font-medium",
                status.type === "success"
                  ? "bg-green-100 text-green-700"
                  : "bg-red-100 text-red-700",
              )}
            >
              {status.message}
            </div>
          )}

          {campaignNotice && (
            <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
              <p className="font-semibold">{tt("Campaign auto-created")}</p>
              <p className="mt-1">
                {tt(
                  "Campaign {{campaignId}} ({{campaignName}}) was created for this broadcast.",
                  {
                    campaignId: campaignNotice.campaignId,
                    campaignName: campaignNotice.campaignName,
                  },
                )}
                {campaignNotice.usersCount && campaignNotice.threshold
                  ? ` ${tt(
                      "Because the audience ({{usersCount}}) exceeds {{threshold}}.",
                      {
                        usersCount: campaignNotice.usersCount,
                        threshold: campaignNotice.threshold,
                      },
                    )}`
                  : ""}
              </p>
            </div>
          )}
        </form>
      </div>

      <div className="flex flex-col gap-6 self-start xl:sticky xl:top-6">
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-4 gap-3">
            <div>
              <div className="text-xs uppercase tracking-wider text-slate-500 font-semibold">
                {step === "test"
                  ? tt("Test environment")
                  : tt("Live environment")}
              </div>
              <h3 className="text-2xl font-semibold">{tt("Live Preview")}</h3>
            </div>
            <Button
              type="submit"
              form={formId}
              className={clsx(
                "h-11 rounded-xl",
                step === "test"
                  ? "bg-emerald-600 hover:bg-emerald-700"
                  : "bg-rose-600 hover:bg-rose-700",
              )}
              disabled={!canSubmit}
            >
              {isSubmitting
                ? tt("Sending...")
                : step === "test"
                  ? tt("Send Test Notification")
                  : deliveryMode === "scheduled"
                    ? tt("Schedule Live Notification")
                    : tt("Send Live Notification")}
            </Button>
          </div>

          <div className="flex justify-between items-center mb-6 gap-3 flex-wrap">
            <div className="flex bg-slate-100 p-1 rounded-xl">
              {(["ios", "android", "huawei", "web"] as const).map(
                (platform) => (
                  <button
                    key={platform}
                    onClick={() => setPreviewPlatform(platform)}
                    className={clsx(
                      "px-3 py-1.5 text-sm font-bold rounded-lg transition-all",
                      previewPlatform === platform
                        ? "bg-white shadow-sm border border-slate-200"
                        : "text-slate-500",
                    )}
                  >
                    {getPlatformLabel(platform)}
                  </button>
                ),
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setPreviewDirection("ltr")}
                className={clsx(
                  "px-3 py-1.5 text-xs font-bold border rounded-lg",
                  previewDirection === "ltr"
                    ? "bg-slate-200 border-slate-200"
                    : "bg-white border-slate-200",
                )}
              >
                LTR
              </button>
              <button
                onClick={() => setPreviewDirection("rtl")}
                className={clsx(
                  "px-3 py-1.5 text-xs font-bold border rounded-lg",
                  previewDirection === "rtl"
                    ? "bg-slate-200 border-slate-200"
                    : "bg-white border-slate-200",
                )}
              >
                RTL
              </button>
            </div>
          </div>

          <div className="flex justify-center p-8 bg-slate-100 rounded-xl">
              <NotificationPreview
                platform={previewPlatform}
              title={formData.title || tt("Notification Title")}
              body={
                formData.body ||
                tt("This is how your message will look to your users.")
              }
              subtitle={
                (showSubtitle ? formData.subtitle : "") ||
                apps.find((a) => a.id === formData.appId)?.name ||
                tt("NotifyX")
              }
              image={formData.image || undefined}
              ctaUrl={
                (formData.tapActionValue.trim() ||
                  apps.find((a) => a.id === formData.appId)?.defaultTapActionValue ||
                  undefined)
              }
              ctaActions={[
                {
                  type: formData.ctaType,
                  label:
                    formData.ctaLabel.trim() || getDefaultCtaLabel(formData.ctaType),
                  value: ctaNeedsValue ? formData.ctaValue.trim() : "",
                },
                ...(showSecondaryCta
                  ? [
                      {
                        type: formData.ctaTypeSecondary,
                        label:
                          formData.ctaLabelSecondary.trim() ||
                          getDefaultCtaLabel(formData.ctaTypeSecondary),
                        value: secondaryCtaNeedsValue
                          ? formData.ctaValueSecondary.trim()
                          : "",
                      },
                    ]
                  : []),
              ]
                .filter((cta) => cta.type !== "none" && cta.label)
                .map((cta) => ({
                  label: cta.label,
                  value: cta.value || undefined,
                }))}
              direction={previewDirection}
              selectedPlatforms={
                formData.platforms.filter((p) =>
                  MOBILE_PLATFORMS.includes(
                    p as (typeof MOBILE_PLATFORMS)[number],
                  ),
                ) as Array<"ios" | "android" | "huawei">
              }
            />
          </div>
        </div>
      </div>
    </div>
  );
}
