import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Calendar,
  CheckCircle2,
  Clock3,
  ImagePlus,
  Loader2,
  Megaphone,
  Pencil,
  Play,
  Plus,
  Send,
  Trash2,
  Upload,
  Users,
  XCircle,
} from "lucide-react";
import { clsx } from "clsx";
import { Button } from "./ui/button";
import { NotificationPreview } from "./NotificationPreview";
import { apiFetch } from "../lib/api";
import type { Application, Campaign } from "../types";
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
} from "../lib/templateUtils";

interface CampaignsProps {
  apps: Application[];
  token: string | null;
}

type CampaignStatus =
  | "DRAFT"
  | "SCHEDULED"
  | "PROCESSING"
  | "SENDING"
  | "COMPLETED"
  | "CANCELLED"
  | "FAILED"
  | "SENT";
type TargetingMode = "ALL" | "USER_LIST";
type SendPlatform = "ios" | "android" | "huawei" | "web";

import {
  CTA_TYPE_OPTIONS,
  type CtaType,
  getCtaValuePlaceholder,
} from "../constants/cta";

const SEND_PLATFORMS: SendPlatform[] = ["ios", "android", "huawei", "web"];
const MOBILE_PLATFORMS: Array<"ios" | "android" | "huawei"> = [
  "ios",
  "android",
  "huawei",
];

const getApiBaseUrl = () => {
  const configured = import.meta.env.VITE_API_URL || "http://localhost:3000";
  return configured.endsWith("/api/v1")
    ? configured
    : `${configured.replace(/\/$/, "")}/api/v1`;
};
const API_URL = getApiBaseUrl();
const API_KEY = import.meta.env.VITE_API_KEY || "";

const formatDate = (value?: string | null) => {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString();
};

const toDateTimeLocalInputValue = (value?: string | null) => {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  const hours = String(parsed.getHours()).padStart(2, "0");
  const minutes = String(parsed.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

const getStatusBadge = (status: CampaignStatus) => {
  switch (status) {
    case "DRAFT":
      return "bg-slate-100 text-slate-700";
    case "SCHEDULED":
      return "bg-blue-100 text-blue-700";
    case "PROCESSING":
    case "SENDING":
      return "bg-amber-100 text-amber-700";
    case "COMPLETED":
    case "SENT":
      return "bg-emerald-100 text-emerald-700";
    case "FAILED":
      return "bg-rose-100 text-rose-700";
    case "CANCELLED":
      return "bg-slate-200 text-slate-600";
    default:
      return "bg-slate-100 text-slate-700";
  }
};

export function Campaigns({ apps, token }: CampaignsProps) {
  const tc = useScopedTranslation("components", "Campaigns");
  const tt = useCallback(
    (
      key: string,
      params?: Record<string, string | number>,
      fallback?: string,
    ) => tc(key, fallback || key, params),
    [tc],
  );
  const { confirm } = useConfirmDialog();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const allowedAppIds = useMemo(() => new Set(apps.map((app) => app.id)), [apps]);
  const [editorState, setEditorState] = useState<
    | { mode: "create" }
    | {
        mode: "edit";
        campaign: Campaign;
      }
    | null
  >(null);

  const [scheduleTarget, setScheduleTarget] = useState<Campaign | null>(null);
  const [scheduleAtLocal, setScheduleAtLocal] = useState("");
  const [isScheduling, setIsScheduling] = useState(false);

  const loadCampaigns = useCallback(async () => {
    try {
      setIsLoading(true);
      setListError(null);
      const data = await apiFetch<Campaign[]>(
        `/campaigns?ts=${encodeURIComponent(Date.now().toString())}`,
        {},
        token,
      );
      const list = Array.isArray(data) ? data : [];
      setCampaigns(list.filter((campaign) => allowedAppIds.has(campaign.appId)));
    } catch (error: any) {
      setCampaigns([]);
      setListError(error?.message || tt("Failed to load campaigns."));
    } finally {
      setIsLoading(false);
    }
  }, [allowedAppIds, token, tt]);

  useEffect(() => {
    void loadCampaigns();
  }, [loadCampaigns]);

  const currentCampaign = useMemo(
    () =>
      campaigns.find((campaign) =>
        ["SCHEDULED", "PROCESSING", "SENDING"].includes(campaign.status),
      ) || null,
    [campaigns],
  );

  const deleteCampaign = async (id: string) => {
    const approved = await confirm({
      title: tt("Delete Campaign"),
      description: tt("Delete this campaign permanently?"),
      confirmText: tt("Delete"),
      destructive: true,
    });
    if (!approved) return;
    await apiFetch(`/campaigns/${id}`, { method: "DELETE" }, token);
    void loadCampaigns();
  };

  const sendNow = async (id: string) => {
    await apiFetch(`/campaigns/${id}/send`, { method: "POST" }, token);
    void loadCampaigns();
  };

  const cancelCampaign = async (id: string) => {
    await apiFetch(`/campaigns/${id}/cancel`, { method: "POST" }, token);
    void loadCampaigns();
  };

  const scheduleCampaign = async () => {
    if (!scheduleTarget) return;
    setIsScheduling(true);
    try {
      await apiFetch(
        `/campaigns/${scheduleTarget.id}/schedule`,
        {
          method: "POST",
          body: JSON.stringify({
            scheduledAt: scheduleAtLocal
              ? new Date(scheduleAtLocal).toISOString()
              : undefined,
          }),
        },
        token,
      );
      setScheduleTarget(null);
      setScheduleAtLocal("");
      void loadCampaigns();
    } finally {
      setIsScheduling(false);
    }
  };

  if (editorState) {
    return (
      <CampaignEditorPage
        mode={editorState.mode}
        initialCampaign={
          editorState.mode === "edit" ? editorState.campaign : null
        }
        apps={apps}
        token={token}
        onBack={() => setEditorState(null)}
        onSaved={() => {
          setEditorState(null);
          void loadCampaigns();
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">{tt("Campaigns")}</h3>
          <p className="text-sm text-slate-500">
            {tt("Build, test, and schedule large broadcasts safely.")}
          </p>
        </div>
        <Button onClick={() => setEditorState({ mode: "create" })}>
          <Plus className="w-4 h-4 me-2" />
          {tt("New Campaign")}
        </Button>
      </div>

      {currentCampaign && (
        <div className="rounded-2xl border border-blue-200 bg-blue-50 px-5 py-4 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">
              {tt("Current Campaign")}
            </p>
            <p className="text-base font-semibold text-blue-900 mt-1">
              {currentCampaign.name}
            </p>
            <p className="text-sm text-blue-800 mt-1">
              {tt("Status")}: {tt(`status_${currentCampaign.status}`)} |{" "}
              {tt("Starts")}:{" "}
              {formatDate(currentCampaign.scheduledAt)}
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              setEditorState({ mode: "edit", campaign: currentCampaign })
            }
          >
            <Pencil className="w-4 h-4 me-1" />
            {tt("Edit")}
          </Button>
        </div>
      )}

      {isLoading ? (
        <div className="bg-white rounded-xl border p-12 text-center text-slate-400">
          {tt("Loading campaigns...")}
        </div>
      ) : listError ? (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-6">
          <p className="text-rose-700 font-medium">
            {tt("Failed to load campaigns")}
          </p>
          <p className="text-rose-600 text-sm mt-1">{listError}</p>
          <div className="mt-4">
            <Button variant="outline" onClick={() => void loadCampaigns()}>
              {tt("Retry")}
            </Button>
          </div>
        </div>
      ) : campaigns.length === 0 ? (
        <div className="bg-white rounded-xl border p-12 text-center text-slate-400">
          <Megaphone className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>{tt("No campaigns yet. Create your first one.")}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {campaigns.map((campaign) => (
            <div
              key={campaign.id}
              className="bg-white rounded-xl border p-5 flex flex-col gap-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-2 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="text-lg font-semibold text-slate-900 truncate">
                      {campaign.name}
                    </h4>
                    <span
                      className={clsx(
                        "px-2 py-0.5 rounded-full text-xs font-semibold uppercase",
                        getStatusBadge(campaign.status as CampaignStatus),
                      )}
                    >
                      {tt(`status_${campaign.status}`)}
                    </span>
                  </div>
                  {campaign.description && (
                    <p className="text-sm text-slate-500">{campaign.description}</p>
                  )}
                  <p className="text-sm text-slate-700 line-clamp-2">
                    {campaign.body}
                  </p>
                  <div className="text-xs text-slate-500 flex flex-wrap gap-3">
                    <span>
                      {tt("Targets")}: {campaign.totalTargets.toLocaleString()}
                    </span>
                    <span>
                      {tt("Created")}: {formatDate(campaign.createdAt)}
                    </span>
                    <span>
                      {tt("Scheduled")}: {formatDate(campaign.scheduledAt)}
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setEditorState({ mode: "edit", campaign })}
                  >
                    <Pencil className="w-4 h-4 me-1" />
                    {tt("Edit")}
                  </Button>

                  {campaign.status === "DRAFT" && (
                    <>
                      <Button size="sm" onClick={() => void sendNow(campaign.id)}>
                        <Play className="w-4 h-4 me-1" />
                        {tt("Send Now")}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setScheduleTarget(campaign);
                          setScheduleAtLocal("");
                        }}
                      >
                        <Calendar className="w-4 h-4 me-1" />
                        {tt("Schedule")}
                      </Button>
                    </>
                  )}

                  {["SCHEDULED", "PROCESSING", "SENDING"].includes(
                    campaign.status,
                  ) && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void cancelCampaign(campaign.id)}
                    >
                      <XCircle className="w-4 h-4 me-1" />
                      {tt("Cancel")}
                    </Button>
                  )}

                  {["DRAFT", "CANCELLED"].includes(campaign.status) && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void deleteCampaign(campaign.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {scheduleTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg">
            <h3 className="text-lg font-semibold">{tt("Schedule Campaign")}</h3>
            <p className="text-sm text-slate-600 mt-1">
              {tt("Set a send time for this live campaign.")}
            </p>

            <div className="mt-4">
              <label className="block text-sm font-semibold mb-2">
                {tt("Send at")}
              </label>
              <input
                type="datetime-local"
                className="w-full h-12 px-4 border border-slate-200 rounded-xl text-sm"
                value={scheduleAtLocal}
                onChange={(event) => setScheduleAtLocal(event.target.value)}
              />
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setScheduleTarget(null)}>
                {tt("Cancel")}
              </Button>
              <Button onClick={() => void scheduleCampaign()} disabled={isScheduling}>
                {isScheduling ? tt("Scheduling...") : tt("Schedule")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CampaignEditorPage({
  mode,
  initialCampaign,
  apps,
  token,
  onBack,
  onSaved,
}: {
  mode: "create" | "edit";
  initialCampaign: Campaign | null;
  apps: Application[];
  token: string | null;
  onBack: () => void;
  onSaved: () => void;
}) {
  const tc = useScopedTranslation("components", "Campaigns");
  const tt = useCallback(
    (
      key: string,
      params?: Record<string, string | number>,
      fallback?: string,
    ) => tc(key, fallback || key, params),
    [tc],
  );
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const existingData = (initialCampaign?.data || {}) as Record<string, string>;
  const initialPrimaryCtaType = (existingData.ctaType || "none") as CtaType;
  const initialPrimaryCtaLabel = existingData.ctaLabel || "";
  const initialPrimaryCtaValue = existingData.ctaValue || "";
  const initialSecondaryCtaType = (existingData.ctaTypeSecondary ||
    "none") as CtaType;
  const initialSecondaryCtaLabel = existingData.ctaLabelSecondary || "";
  const initialSecondaryCtaValue = existingData.ctaValueSecondary || "";
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [isSchedulingLive, setIsSchedulingLive] = useState(false);
  const [isSendingNow, setIsSendingNow] = useState(false);
  const [campaignId, setCampaignId] = useState<string | null>(
    initialCampaign?.id || null,
  );
  const [scheduleAtLocal, setScheduleAtLocal] = useState(
    toDateTimeLocalInputValue(initialCampaign?.scheduledAt || null),
  );

  const [previewPlatform, setPreviewPlatform] = useState<SendPlatform>("ios");
  const [previewDirection, setPreviewDirection] = useState<"ltr" | "rtl">(
    "ltr",
  );

  const [status, setStatus] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [templates, setTemplates] = useState<GroupedTemplate[]>([]);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false);
  const [selectedTemplateKey, setSelectedTemplateKey] = useState("");
  const [selectedTemplateLanguage, setSelectedTemplateLanguage] = useState("");
  const [templateVariables, setTemplateVariables] = useState<
    Record<string, string>
  >({});

  const [formData, setFormData] = useState({
    appId: initialCampaign?.appId || "",
    name: initialCampaign?.name || "",
    description: initialCampaign?.description || "",
    targetingMode: (initialCampaign?.targetingMode || "ALL") as TargetingMode,
    targetUserIds: initialCampaign?.targetUserIds || ([] as string[]),
    testUserIds: [] as string[],
    title: initialCampaign?.title || "",
    subtitle: initialCampaign?.subtitle || "",
    body: initialCampaign?.body || "",
    image: initialCampaign?.image || "",
    actionUrl: initialCampaign?.actionUrl || "",
    ctaType: initialPrimaryCtaType,
    ctaLabel: initialPrimaryCtaLabel,
    ctaValue: initialPrimaryCtaValue,
    ctaTypeSecondary: initialSecondaryCtaType,
    ctaLabelSecondary: initialSecondaryCtaLabel,
    ctaValueSecondary: initialSecondaryCtaValue,
    priority: (initialCampaign?.priority as "LOW" | "NORMAL" | "HIGH") || "HIGH",
    platforms:
      initialCampaign?.platforms?.length && Array.isArray(initialCampaign.platforms)
        ? (initialCampaign.platforms as SendPlatform[])
        : ([...SEND_PLATFORMS] as SendPlatform[]),
  });
  const {
    allUsers: subscribedUsers,
    testTargetUsers,
    hasCustomTestTargetUsers,
    isLoading: isLoadingUsers,
    error: usersLoadError,
  } = useAppTestTargetUsers(formData.appId, token);

  const getPlatformLabel = (platform: SendPlatform) => {
    const defaults: Record<SendPlatform, string> = {
      ios: "iOS",
      android: "Android",
      huawei: "Huawei",
      web: "Web",
    };
    return tt(`platform_${platform}`, undefined, defaults[platform]);
  };

  const ctaNeedsValue = useMemo(
    () =>
      CTA_TYPE_OPTIONS.find((option) => option.value === formData.ctaType)
        ?.needsValue ?? false,
    [formData.ctaType],
  );

  const secondaryCtaNeedsValue = useMemo(
    () =>
      CTA_TYPE_OPTIONS.find(
        (option) => option.value === formData.ctaTypeSecondary,
      )?.needsValue ?? false,
    [formData.ctaTypeSecondary],
  );

  const campaignTemplates = useMemo(
    () => templates.filter((template) => template.type === "campaign"),
    [templates],
  );

  const selectedTemplate = useMemo(
    () =>
      campaignTemplates.find((template) => template.key === selectedTemplateKey) ||
      null,
    [campaignTemplates, selectedTemplateKey],
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
  }, [selectedTemplateVariant, templateVariablesPayload]);

  useEffect(() => {
    if (!selectedTemplateKey) return;
    if (!campaignTemplates.some((template) => template.key === selectedTemplateKey)) {
      setSelectedTemplateKey("");
      setSelectedTemplateLanguage("");
      setTemplateVariables({});
    }
  }, [campaignTemplates, selectedTemplateKey]);

  useEffect(() => {
    if (!selectedTemplate) {
      setTemplateVariables({});
    }
  }, [selectedTemplate]);

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

  useEffect(() => {
    const allUserIds = new Set(subscribedUsers.map((user) => user.externalUserId));
    const testUserIds = new Set(testTargetUsers.map((user) => user.externalUserId));

    setFormData((prev) => {
      const nextTargetUserIds = prev.targetUserIds.filter((id) => allUserIds.has(id));
      const nextTestUserIds = prev.testUserIds.filter((id) => testUserIds.has(id));
      const targetChanged =
        nextTargetUserIds.length !== prev.targetUserIds.length ||
        nextTargetUserIds.some((id, index) => id !== prev.targetUserIds[index]);
      const testChanged =
        nextTestUserIds.length !== prev.testUserIds.length ||
        nextTestUserIds.some((id, index) => id !== prev.testUserIds[index]);

      if (!targetChanged && !testChanged) return prev;

      return {
        ...prev,
        targetUserIds: nextTargetUserIds,
        testUserIds: nextTestUserIds,
      };
    });
  }, [subscribedUsers, testTargetUsers]);

  const togglePlatform = (platform: SendPlatform) => {
    setFormData((prev) => ({
      ...prev,
      platforms: prev.platforms.includes(platform)
        ? prev.platforms.filter((value) => value !== platform)
        : [...prev.platforms, platform],
    }));
  };

  const handleImageUpload = async (file: File) => {
    if (!token && !API_KEY) {
      setStatus({ type: "error", message: tt("Missing auth token.") });
      return;
    }

    setIsUploadingImage(true);
    setStatus(null);
    try {
      const body = new FormData();
      body.append("file", file);

      const headers = new Headers();
      if (token) headers.set("Authorization", `Bearer ${token}`);
      if (API_KEY) headers.set("X-API-Key", API_KEY);

      const response = await fetch(`${API_URL}/uploads`, {
        method: "POST",
        headers,
        body,
      });

      const json = await response.json().catch(() => null);
      if (!response.ok) throw new Error(json?.message || tt("Upload failed"));

      const url = json?.data?.url as string | undefined;
      if (!url) throw new Error(tt("Upload did not return a URL"));

      setFormData((prev) => ({ ...prev, image: url }));
    } catch (error: any) {
      setStatus({
        type: "error",
        message: error?.message || tt("Failed to upload image."),
      });
    } finally {
      setIsUploadingImage(false);
    }
  };

  const validateCampaignForm = (options?: {
    requireTestUsers?: boolean;
    requireScheduleTime?: boolean;
  }) => {
    if (!formData.appId || !formData.name.trim()) {
      setStatus({
        type: "error",
        message: tt("App and campaign name are required."),
      });
      return false;
    }
    if (!formData.title.trim() || !formData.body.trim()) {
      setStatus({ type: "error", message: tt("Title and body are required.") });
      return false;
    }
    if (!formData.actionUrl.trim()) {
      setStatus({
        type: "error",
        message: tt("Default open-link URL is required."),
      });
      return false;
    }
    if (
      formData.targetingMode === "USER_LIST" &&
      formData.targetUserIds.length === 0
    ) {
      setStatus({
        type: "error",
        message: tt(
          "Select at least one live target user for Specific Users mode.",
        ),
      });
      return false;
    }
    if (options?.requireTestUsers && formData.testUserIds.length === 0) {
      setStatus({
        type: "error",
        message: tt("Select at least one test user before sending."),
      });
      return false;
    }
    if (formData.platforms.length === 0) {
      setStatus({
        type: "error",
        message: tt("Select at least one target platform."),
      });
      return false;
    }
    if (options?.requireScheduleTime) {
      if (!scheduleAtLocal) {
        setStatus({
          type: "error",
          message: tt("Set date and time before scheduling."),
        });
        return false;
      }
      const scheduledDate = new Date(scheduleAtLocal);
      if (Number.isNaN(scheduledDate.getTime()) || scheduledDate <= new Date()) {
        setStatus({
          type: "error",
          message: tt("Schedule time must be in the future."),
        });
        return false;
      }
    }
    return true;
  };

  const buildCtaArtifacts = () => {
    const ctaCandidates = [
      {
        type: formData.ctaType,
        label: formData.ctaLabel.trim(),
        value: formData.ctaValue.trim(),
        dataSuffix: "",
      },
      {
        type: formData.ctaTypeSecondary,
        label: formData.ctaLabelSecondary.trim(),
        value: formData.ctaValueSecondary.trim(),
        dataSuffix: "Secondary",
      },
    ];

    const ctaData: Record<string, string> = {};
    for (const cta of ctaCandidates) {
      if (cta.type === "none") continue;
      if (!cta.label || !cta.value) {
        setStatus({
          type: "error",
          message: tt("CTA button label and URL are both required when enabled."),
        });
        return null;
      }
      ctaData[`ctaType${cta.dataSuffix}`] = cta.type;
      ctaData[`ctaLabel${cta.dataSuffix}`] = cta.label;
      ctaData[`ctaValue${cta.dataSuffix}`] = cta.value;
    }

    const actions = ctaCandidates
      .filter((cta) => cta.type !== "none" && cta.label && cta.value)
      .slice(0, 2)
      .map((cta, index) => ({
        action:
          index === 0
            ? ("open_link_primary" as const)
            : ("open_link_secondary" as const),
        title: cta.label,
        url: cta.value,
      }));

    return {
      defaultActionUrl: formData.actionUrl.trim(),
      ctaData,
      actions,
    };
  };

  const buildCampaignPayload = (ctaArtifacts: {
    defaultActionUrl: string;
    ctaData: Record<string, string>;
    actions: Array<{ action: string; title: string; url: string }>;
  }) => ({
    appId: formData.appId,
    name: formData.name.trim(),
    description: formData.description.trim() || undefined,
    targetingMode: formData.targetingMode,
    targetUserIds:
      formData.targetingMode === "USER_LIST" ? formData.targetUserIds : undefined,
    title: formData.title.trim(),
    subtitle: formData.subtitle.trim() || undefined,
    body: formData.body.trim(),
    image: formData.image || undefined,
    actionUrl: ctaArtifacts.defaultActionUrl,
    data:
      Object.keys(ctaArtifacts.ctaData).length > 0
        ? ctaArtifacts.ctaData
        : undefined,
    actions: ctaArtifacts.actions.length > 0 ? ctaArtifacts.actions : undefined,
    platforms: formData.platforms,
    priority: formData.priority,
  });

  const persistCampaign = async (payload: ReturnType<typeof buildCampaignPayload>) => {
    setIsSaving(true);
    try {
      const saved =
        campaignId
          ? await apiFetch<{ id: string }>(
              `/campaigns/${campaignId}`,
              {
                method: "PUT",
                body: JSON.stringify(payload),
              },
              token,
            )
          : await apiFetch<{ id: string }>(
              "/campaigns",
              {
                method: "POST",
                body: JSON.stringify(payload),
              },
              token,
            );
      if (saved?.id) {
        setCampaignId(saved.id);
        return saved.id;
      }
      return null;
    } catch (error: any) {
      setStatus({
        type: "error",
        message: error?.message || tt("Failed to save campaign."),
      });
      return null;
    } finally {
      setIsSaving(false);
    }
  };

  const sendTestNotification = async (ctaArtifacts: {
    defaultActionUrl: string;
    ctaData: Record<string, string>;
    actions: Array<{ action: string; title: string; url: string }>;
  }) => {
    await apiFetch(
      "/notifications",
      {
        method: "POST",
        body: JSON.stringify({
          appId: formData.appId,
          type: "campaign",
          templateId: selectedTemplateVariant?.id || undefined,
          variables: selectedTemplateVariant
            ? templateVariablesPayload
            : undefined,
          title: selectedTemplateVariant ? undefined : formData.title.trim(),
          subtitle: selectedTemplateVariant
            ? undefined
            : formData.subtitle.trim() || undefined,
          body: selectedTemplateVariant ? undefined : formData.body.trim(),
          image: formData.image || undefined,
          actionUrl: ctaArtifacts.defaultActionUrl,
          data:
            Object.keys(ctaArtifacts.ctaData).length > 0
              ? ctaArtifacts.ctaData
              : undefined,
          actions:
            ctaArtifacts.actions.length > 0 ? ctaArtifacts.actions : undefined,
          priority: "HIGH",
          userIds: formData.testUserIds,
          platforms: formData.platforms,
        }),
      },
      token,
    );
  };

  const handleSendTest = async () => {
    setStatus(null);
    if (!validateCampaignForm({ requireTestUsers: true })) return;
    const ctaArtifacts = buildCtaArtifacts();
    if (!ctaArtifacts) return;

    setIsSendingTest(true);
    try {
      await sendTestNotification(ctaArtifacts);
      setStatus({
        type: "success",
        message: tt("Test notification queued."),
      });
    } catch (error: any) {
      setStatus({
        type: "error",
        message: error?.message || tt("Failed to send test notification."),
      });
    } finally {
      setIsSendingTest(false);
    }
  };

  const handleSaveCampaign = async () => {
    setStatus(null);
    if (!validateCampaignForm()) return;
    const ctaArtifacts = buildCtaArtifacts();
    if (!ctaArtifacts) return;

    const wasCreate = !campaignId;
    const savedId = await persistCampaign(buildCampaignPayload(ctaArtifacts));
    if (!savedId) return;

    setStatus({
      type: "success",
      message: wasCreate ? tt("Campaign saved.") : tt("Campaign updated."),
    });
    onSaved();
  };

  const handleScheduleCampaign = async () => {
    setStatus(null);
    if (!validateCampaignForm({ requireScheduleTime: true })) return;
    const ctaArtifacts = buildCtaArtifacts();
    if (!ctaArtifacts) return;

    const savedId = await persistCampaign(buildCampaignPayload(ctaArtifacts));
    if (!savedId) return;

    setIsSchedulingLive(true);
    try {
      await apiFetch(
        `/campaigns/${savedId}/schedule`,
        {
          method: "POST",
          body: JSON.stringify({
            scheduledAt: new Date(scheduleAtLocal).toISOString(),
          }),
        },
        token,
      );
      setStatus({
        type: "success",
        message: tt("Campaign scheduled."),
      });
      onSaved();
    } catch (error: any) {
      setStatus({
        type: "error",
        message: error?.message || tt("Failed to schedule campaign."),
      });
    } finally {
      setIsSchedulingLive(false);
    }
  };

  const handleSendNowCampaign = async () => {
    setStatus(null);
    if (!validateCampaignForm()) return;
    const ctaArtifacts = buildCtaArtifacts();
    if (!ctaArtifacts) return;

    const savedId = await persistCampaign(buildCampaignPayload(ctaArtifacts));
    if (!savedId) return;

    setIsSendingNow(true);
    try {
      await apiFetch(
        `/campaigns/${savedId}/send`,
        {
          method: "POST",
        },
        token,
      );
      setStatus({
        type: "success",
        message: tt("Campaign sent now."),
      });
      onSaved();
    } catch (error: any) {
      setStatus({
        type: "error",
        message: error?.message || tt("Failed to send campaign now."),
      });
    } finally {
      setIsSendingNow(false);
    }
  };

  const userSelectClass =
    "w-full min-h-36 border border-slate-200 rounded-xl p-3 text-sm bg-white";
  const getTargetUserOptionLabel = (user: (typeof subscribedUsers)[number]) =>
    `${getUserIdentityLabel(user)} (${user.devicesCount} devices)`;
  const isAnyActionRunning =
    isSaving || isSendingTest || isSchedulingLive || isSendingNow;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-xl font-semibold">
            {mode === "create" ? tt("Create Campaign") : tt("Edit Campaign")}
          </h3>
          <p className="text-sm text-slate-500 mt-1">
            {tt(
              "Save campaign content and send test messages to selected users before scheduling live.",
            )}
          </p>
        </div>
        <Button variant="outline" onClick={onBack}>
          {tt("Back to campaigns")}
        </Button>
      </div>

      {status && (
        <div
          className={clsx(
            "rounded-xl border px-4 py-3 text-sm",
            status.type === "error"
              ? "bg-rose-50 border-rose-200 text-rose-700"
              : "bg-emerald-50 border-emerald-200 text-emerald-700",
          )}
        >
          {status.message}
        </div>
      )}

      <div className="bg-white rounded-2xl border shadow-sm p-6 lg:p-8 grid grid-cols-1 xl:grid-cols-2 gap-8">
        <div className="space-y-5">
          <div>
            <label className="block text-sm font-semibold mb-2">
              {tt("App")} *
            </label>
            <select
              className="w-full h-12 px-4 border border-slate-200 rounded-xl text-sm bg-white"
              value={formData.appId}
              onChange={(event) => {
                setSelectedTemplateKey("");
                setSelectedTemplateLanguage("");
                setTemplateVariables({});
                setFormData((prev) => ({
                  ...prev,
                  appId: event.target.value,
                  targetUserIds: [],
                  testUserIds: [],
                }));
              }}
              disabled={mode === "edit"}
            >
              <option value="">{tt("Select an app")}</option>
              {apps.map((app) => (
                <option key={app.id} value={app.id}>
                  {app.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-semibold mb-2">
              {tt("Campaign Name")} *
            </label>
            <input
              className="w-full h-12 px-4 border border-slate-200 rounded-xl text-sm"
              value={formData.name}
              onChange={(event) =>
                setFormData((prev) => ({ ...prev, name: event.target.value }))
              }
              placeholder={tt("e.g. Spring launch blast")}
            />
          </div>

          <div>
            <label className="block text-sm font-semibold mb-2">
              {tt("Description")}
            </label>
            <input
              className="w-full h-12 px-4 border border-slate-200 rounded-xl text-sm"
              value={formData.description}
              onChange={(event) =>
                setFormData((prev) => ({
                  ...prev,
                  description: event.target.value,
                }))
              }
              placeholder={tt("Optional description")}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold mb-2">
                {tt("Targeting")}
              </label>
              <select
                className="w-full h-12 px-4 border border-slate-200 rounded-xl text-sm bg-white"
                value={formData.targetingMode}
                onChange={(event) =>
                  setFormData((prev) => ({
                    ...prev,
                    targetingMode: event.target.value as TargetingMode,
                    targetUserIds: [],
                  }))
                }
              >
                <option value="ALL">{tt("All Users")}</option>
                <option value="USER_LIST">{tt("Specific Users")}</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold mb-2">
                {tt("Priority")}
              </label>
              <select
                className="w-full h-12 px-4 border border-slate-200 rounded-xl text-sm bg-white"
                value={formData.priority}
                onChange={(event) =>
                  setFormData((prev) => ({
                    ...prev,
                    priority: event.target.value as "LOW" | "NORMAL" | "HIGH",
                  }))
                }
              >
                <option value="LOW">{tt("Low")}</option>
                <option value="NORMAL">{tt("Normal")}</option>
                <option value="HIGH">{tt("High")}</option>
              </select>
            </div>
          </div>

          {formData.targetingMode === "USER_LIST" && (
            <div>
              <label className="block text-sm font-semibold mb-2">
                {tt("Live target users")}
              </label>
              <select
                multiple
                className={userSelectClass}
                value={formData.targetUserIds}
                onChange={(event) =>
                  setFormData((prev) => ({
                    ...prev,
                    targetUserIds: Array.from(event.target.selectedOptions).map(
                      (option) => option.value,
                    ),
                  }))
                }
              >
                {subscribedUsers.length === 0 ? (
                  <option disabled value="">
                    {isLoadingUsers
                      ? tt("Loading users...")
                      : tt("No users with devices")}
                  </option>
                ) : (
                  subscribedUsers.map((user) => (
                    <option key={user.externalUserId} value={user.externalUserId}>
                      {getTargetUserOptionLabel(user)}
                    </option>
                  ))
                )}
              </select>
              <p className="mt-2 text-xs text-slate-500">
                {tt("Hold Cmd/Ctrl to select multiple users.")}
              </p>
            </div>
          )}

          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-emerald-900 mb-2">
              <Users className="w-4 h-4" />
              {tt("Test recipients (required)")}
            </div>
            <select
              multiple
              className={userSelectClass}
              value={formData.testUserIds}
              onChange={(event) =>
                setFormData((prev) => ({
                  ...prev,
                  testUserIds: Array.from(event.target.selectedOptions).map(
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
                      : tt("No users with devices")}
                </option>
              ) : (
                testTargetUsers.map((user) => (
                  <option key={user.externalUserId} value={user.externalUserId}>
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
          {usersLoadError && (
            <p className="text-xs text-rose-600">{usersLoadError}</p>
          )}

          <div>
            <label className="block text-sm font-semibold mb-2">
              {tt("Template")}
            </label>
            <div className="rounded-xl border border-slate-200 p-4 bg-slate-50 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                  {tt("Campaign template")}
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
                <select
                  className="w-full h-12 px-4 border border-slate-200 rounded-xl text-sm bg-white"
                  value={selectedTemplateKey}
                  onChange={(event) => {
                    const nextKey = event.target.value;
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
                      : campaignTemplates.length > 0
                        ? tt("No template (manual content)")
                        : tt("No campaign templates")}
                  </option>
                  {campaignTemplates.map((template) => (
                    <option key={template.key} value={template.key}>
                      {template.name}
                    </option>
                  ))}
                </select>

                <select
                  className="w-full h-12 px-4 border border-slate-200 rounded-xl text-sm bg-white"
                  value={selectedTemplateLanguage}
                  onChange={(event) => setSelectedTemplateLanguage(event.target.value)}
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
                </select>
              </div>

              {selectedTemplateVariant && templateVariableKeys.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {templateVariableKeys.map((key) => (
                    <div key={key}>
                      <label className="block text-xs font-medium text-slate-500 mb-1">
                        {`{{${key}}}`}
                      </label>
                      <input
                        className="w-full h-12 px-4 border border-slate-200 rounded-xl text-sm bg-white"
                        value={templateVariables[key] || ""}
                        onChange={(event) =>
                          setTemplateVariables((prev) => ({
                            ...prev,
                            [key]: event.target.value,
                          }))
                        }
                        placeholder={tt("Value for {{key}}", { key })}
                      />
                    </div>
                  ))}
                </div>
              )}

              {selectedTemplateVariant && (
                <p className="text-xs text-slate-500">
                  {tt(
                    "Title, subtitle, and body are auto-generated from this template.",
                  )}
                </p>
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold mb-2">
              {tt("Platforms")}
            </label>
            <div className="flex flex-wrap gap-2">
              {SEND_PLATFORMS.map((platform) => (
                <button
                  key={platform}
                  type="button"
                  onClick={() => togglePlatform(platform)}
                  className={clsx(
                    "px-3 py-1.5 text-sm font-semibold rounded-lg border",
                    formData.platforms.includes(platform)
                      ? "bg-slate-900 text-white border-slate-900"
                      : "bg-white text-slate-600 border-slate-200",
                  )}
                >
                  {getPlatformLabel(platform)}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold mb-2">
              {tt("Title")} *
            </label>
            <input
              className="w-full h-12 px-4 border border-slate-200 rounded-xl text-sm"
              value={formData.title}
              onChange={(event) =>
                setFormData((prev) => ({ ...prev, title: event.target.value }))
              }
              disabled={Boolean(selectedTemplateVariant)}
              placeholder={
                selectedTemplateVariant
                  ? tt("Generated from template")
                  : tt("Campaign title")
              }
            />
          </div>

          <div>
            <label className="block text-sm font-semibold mb-2">
              {tt("Subtitle")}
            </label>
            <input
              className="w-full h-12 px-4 border border-slate-200 rounded-xl text-sm"
              value={formData.subtitle}
              onChange={(event) =>
                setFormData((prev) => ({ ...prev, subtitle: event.target.value }))
              }
              disabled={Boolean(selectedTemplateVariant)}
              placeholder={
                selectedTemplateVariant
                  ? tt("Generated from template")
                  : tt("Optional subtitle")
              }
            />
          </div>

          <div>
            <label className="block text-sm font-semibold mb-2">
              {tt("Body")} *
            </label>
            <textarea
              className="w-full p-4 h-32 border border-slate-200 rounded-xl text-sm disabled:bg-slate-50 disabled:text-slate-500"
              value={formData.body}
              onChange={(event) =>
                setFormData((prev) => ({ ...prev, body: event.target.value }))
              }
              disabled={Boolean(selectedTemplateVariant)}
              placeholder={
                selectedTemplateVariant
                  ? tt("Generated from template")
                  : tt("Campaign body")
              }
            />
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-sm font-semibold mb-2">
                {tt("Default open-link URL")} *
              </label>
              <input
                type="url"
                className="w-full h-12 px-4 border border-slate-200 rounded-xl text-sm"
                value={formData.actionUrl}
                onChange={(event) =>
                  setFormData((prev) => ({
                    ...prev,
                    actionUrl: event.target.value,
                  }))
                }
                placeholder="https://..."
              />
            </div>

            <div className="rounded-xl border border-slate-200 p-4 bg-slate-50">
              <div className="text-sm font-semibold text-slate-700 mb-3">
                {tt("CTA Button 1 (optional)")}
              </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-sm font-semibold mb-2">
                  {tt("CTA Type")}
                </label>
                <select
                  className="w-full h-12 px-4 border border-slate-200 rounded-xl text-sm bg-white"
                  value={formData.ctaType}
                  onChange={(event) =>
                    setFormData((prev) => ({
                      ...prev,
                      ctaType: event.target.value as CtaType,
                    }))
                  }
                >
                  {CTA_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {tt(option.label)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2">
                  {tt("CTA Label")}
                </label>
                <input
                  className="w-full h-12 px-4 border border-slate-200 rounded-xl text-sm"
                  value={formData.ctaLabel}
                  onChange={(event) =>
                    setFormData((prev) => ({
                      ...prev,
                      ctaLabel: event.target.value,
                    }))
                  }
                  placeholder={tt("Open link")}
                />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2">
                  {tt("CTA URL")}
                </label>
                <input
                  type="url"
                  className="w-full h-12 px-4 border border-slate-200 rounded-xl text-sm"
                  value={formData.ctaValue}
                  onChange={(event) =>
                    setFormData((prev) => ({
                      ...prev,
                      ctaValue: event.target.value,
                    }))
                  }
                  disabled={!ctaNeedsValue}
                  placeholder={tt(getCtaValuePlaceholder(formData.ctaType))}
                />
              </div>
            </div>
            </div>

            <div className="rounded-xl border border-slate-200 p-4 bg-slate-50">
              <div className="text-sm font-semibold text-slate-700 mb-3">
                {tt("CTA Button 2 (optional)")}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-2">
                    {tt("CTA Type")}
                  </label>
                  <select
                    className="w-full h-12 px-4 border border-slate-200 rounded-xl text-sm bg-white"
                    value={formData.ctaTypeSecondary}
                    onChange={(event) =>
                      setFormData((prev) => ({
                        ...prev,
                        ctaTypeSecondary: event.target.value as CtaType,
                      }))
                    }
                  >
                    {CTA_TYPE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {tt(option.label)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-2">
                    {tt("CTA Label")}
                  </label>
                  <input
                    className="w-full h-12 px-4 border border-slate-200 rounded-xl text-sm"
                    value={formData.ctaLabelSecondary}
                    onChange={(event) =>
                      setFormData((prev) => ({
                        ...prev,
                        ctaLabelSecondary: event.target.value,
                      }))
                    }
                    placeholder={tt("Learn more")}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-2">
                    {tt("CTA URL")}
                  </label>
                  <input
                    type="url"
                    className="w-full h-12 px-4 border border-slate-200 rounded-xl text-sm"
                    value={formData.ctaValueSecondary}
                    onChange={(event) =>
                      setFormData((prev) => ({
                        ...prev,
                        ctaValueSecondary: event.target.value,
                      }))
                    }
                    disabled={!secondaryCtaNeedsValue}
                    placeholder={tt(
                      getCtaValuePlaceholder(formData.ctaTypeSecondary),
                    )}
                  />
                </div>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold mb-2">
              {tt("Image")}
            </label>
            <div className="w-full border border-dashed border-slate-300 rounded-xl p-4 bg-slate-50">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  {formData.image ? (
                    <img
                      src={formData.image}
                      alt="Campaign upload preview"
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
                        : tt("Upload campaign image")}
                    </p>
                    <p className="text-xs text-slate-500">
                      {tt("PNG/JPG up to 5MB")}
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
                      onClick={() => setFormData((prev) => ({ ...prev, image: "" }))}
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
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void handleImageUpload(file);
                  event.currentTarget.value = "";
                }}
              />
            </div>
          </div>
        </div>

        <div className="bg-slate-50 rounded-2xl p-6 border border-slate-200 self-start xl:sticky xl:top-6">
          <div className="flex flex-wrap items-start justify-between mb-4 gap-3">
            <div>
              <div className="text-xs uppercase tracking-wider text-slate-500 font-semibold">
                {tt("Test + Live Preview")}
              </div>
              <h4 className="text-xl font-semibold text-slate-900">
                {tt("Campaign Preview")}
              </h4>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => void handleSendTest()}
                disabled={isAnyActionRunning}
              >
                {isSendingTest ? (
                  <Loader2 className="w-4 h-4 me-2 animate-spin" />
                ) : (
                  <Send className="w-4 h-4 me-2" />
                )}
                {tt("Send Test")}
              </Button>
              <Button
                type="button"
                onClick={() => void handleSaveCampaign()}
                disabled={isAnyActionRunning}
              >
                {isSaving ? (
                  <Loader2 className="w-4 h-4 me-2 animate-spin" />
                ) : null}
                {tt("Save")}
              </Button>
              <input
                type="datetime-local"
                value={scheduleAtLocal}
                onChange={(event) => setScheduleAtLocal(event.target.value)}
                className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-700"
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => void handleScheduleCampaign()}
                disabled={isAnyActionRunning}
              >
                {isSchedulingLive ? (
                  <Loader2 className="w-4 h-4 me-2 animate-spin" />
                ) : (
                  <Calendar className="w-4 h-4 me-2" />
                )}
                {tt("Schedule")}
              </Button>
              <Button
                type="button"
                onClick={() => void handleSendNowCampaign()}
                disabled={isAnyActionRunning}
              >
                {isSendingNow ? (
                  <Loader2 className="w-4 h-4 me-2 animate-spin" />
                ) : (
                  <Play className="w-4 h-4 me-2" />
                )}
                {tt("Send Now")}
              </Button>
            </div>
          </div>

          <div className="flex justify-between items-center mb-6 gap-3 flex-wrap">
            <div className="flex bg-white p-1 rounded-xl border border-slate-200">
              {(["ios", "android", "huawei", "web"] as const).map((platform) => (
                <button
                  key={platform}
                  type="button"
                  onClick={() => setPreviewPlatform(platform)}
                  className={clsx(
                    "px-3 py-1.5 text-sm font-bold rounded-lg transition-all",
                    previewPlatform === platform ? "bg-slate-200" : "text-slate-500",
                  )}
                >
                  {getPlatformLabel(platform)}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
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
                type="button"
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
              title={formData.title || tt("Campaign Title")}
              subtitle={formData.subtitle || tt("Campaign subtitle")}
              body={formData.body || tt("Campaign body preview")}
              image={formData.image || undefined}
              ctaUrl={formData.actionUrl.trim() || undefined}
              ctaActions={[
                {
                  type: formData.ctaType,
                  label: formData.ctaLabel.trim(),
                  value: ctaNeedsValue ? formData.ctaValue.trim() : "",
                },
                {
                  type: formData.ctaTypeSecondary,
                  label: formData.ctaLabelSecondary.trim(),
                  value: secondaryCtaNeedsValue
                    ? formData.ctaValueSecondary.trim()
                    : "",
                },
              ]
                .filter((cta) => cta.type !== "none" && cta.label)
                .map((cta) => ({
                  label: cta.label,
                  value: cta.value || undefined,
                }))}
              direction={previewDirection}
              selectedPlatforms={
                formData.platforms.filter((platform) =>
                  MOBILE_PLATFORMS.includes(
                    platform as (typeof MOBILE_PLATFORMS)[number],
                  ),
                ) as Array<"ios" | "android" | "huawei">
              }
            />
          </div>

          <div className="mt-5 text-xs text-slate-600 space-y-1">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              {tt(
                "Send Test queues a TEST notification to selected test users.",
              )}
            </div>
            <div className="flex items-center gap-2">
              <Clock3 className="w-3.5 h-3.5 text-blue-600" />
              {tt(
                "Save stores draft changes. Use Schedule or Send Now for LIVE delivery.",
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
