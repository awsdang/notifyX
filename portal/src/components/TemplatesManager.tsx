import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FileText,
  Plus,
  Search,
  Globe,
  Languages,
  Layout,
  Trash2,
  Clock,
  Copy,
  Save,
  MessageSquare,
  AlignLeft,
  AlignRight,
} from "lucide-react";
import { Button } from "./ui/button";
import { useAuthenticatedFetch } from "../context/AuthContext";
import { clsx } from "clsx";
import { NotificationPreview } from "./NotificationPreview";
import { useScopedTranslation } from "../context/I18nContext";

type TemplateType = "transactional" | "campaign";
type CreateTargetField = "title" | "body";
type TemplatesView = "manage" | "create";
type PreviewPlatform = "android" | "ios" | "huawei" | "web";

interface ApiTemplate {
  id: string;
  appId: string;
  type: TemplateType;
  eventName: string;
  language: string;
  title: string;
  subtitle?: string | null;
  body: string;
  variables?: string[] | null;
  createdAt?: string;
}

interface Template {
  id: string;
  key: string;
  appId: string;
  type: TemplateType;
  eventName: string;
  name: string;
  description: string;
  defaultLanguage: string;
  availableLanguages: string[];
  updatedAt: string;
  variantsByLanguage: Record<string, ApiTemplate>;
}

interface TemplateContent {
  language: string;
  title: string;
  body: string;
  subtitle: string;
}

interface CreateTemplateForm {
  name: string;
  language: "en" | "ar" | "ku";
  title: string;
  body: string;
}

interface TemplatesManagerProps {
  appId: string;
}

interface LanguageOption {
  code: string;
  name: string;
  dir: "ltr" | "rtl";
}

const SUPPORTED_LANGUAGES: LanguageOption[] = [
  { code: "en", name: "English", dir: "ltr" },
  { code: "ar", name: "Arabic", dir: "rtl" },
  { code: "ku", name: "Kurdish", dir: "rtl" },
];

const PREDEFINED_TEMPLATE_VARIABLES = [
  "userName",
  "orderId",
  "link",
  "discount",
  "appName",
  "supportUrl",
];

const PREVIEW_PLATFORMS: Array<{ value: PreviewPlatform; label: string }> = [
  { value: "android", label: "Android" },
  { value: "ios", label: "iOS" },
  { value: "huawei", label: "Huawei" },
  { value: "web", label: "Web" },
];

const DEFAULT_CREATE_FORM: CreateTemplateForm = {
  name: "",
  language: "en",
  title: "",
  body: "",
};

function appendVariableToken(content: string, variableName: string): string {
  const token = `{{${variableName}}}`;
  if (content.includes(token)) {
    return content;
  }
  return `${content}${content ? " " : ""}${token}`;
}

function normalizeVariableName(variableName: string): string {
  return variableName
    .trim()
    .replace(/^[{]+|[}]+$/g, "")
    .replace(/\s+/g, "")
    .replace(/[^a-zA-Z0-9_.-]/g, "");
}

function extractTemplateVariables(...texts: string[]): string[] {
  const matches = new Set<string>();
  const pattern = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g;

  for (const text of texts) {
    for (const match of text.matchAll(pattern)) {
      const variableName = normalizeVariableName(match[1] || "");
      if (variableName) {
        matches.add(variableName);
      }
    }
  }

  return Array.from(matches);
}

function humanizeEventName(eventName: string): string {
  return eventName
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function buildEditingContent(
  template: Template,
  language: string,
): TemplateContent {
  const variant = template.variantsByLanguage[language];
  return {
    language,
    title: variant?.title || "",
    body: variant?.body || "",
    subtitle: variant?.subtitle || "",
  };
}

function groupTemplates(records: ApiTemplate[]): Template[] {
  const grouped = new Map<string, ApiTemplate[]>();

  for (const record of records) {
    const key = `${record.type}:${record.eventName}`;
    const entries = grouped.get(key) || [];
    entries.push(record);
    grouped.set(key, entries);
  }

  return Array.from(grouped.entries())
    .map(([key, entries]) => {
      const variantsByLanguage = entries.reduce<Record<string, ApiTemplate>>(
        (acc, entry) => {
          acc[entry.language] = entry;
          return acc;
        },
        {},
      );
      const availableLanguages = Object.keys(variantsByLanguage);
      const defaultLanguage = availableLanguages.includes("en")
        ? "en"
        : availableLanguages[0] || "en";
      const defaultVariant = variantsByLanguage[defaultLanguage] || entries[0];
      const updatedAt = entries.reduce((latest, entry) => {
        const ts = entry.createdAt ? new Date(entry.createdAt).getTime() : 0;
        return ts > latest ? ts : latest;
      }, 0);

      return {
        id: defaultVariant.id,
        key,
        appId: defaultVariant.appId,
        type: defaultVariant.type,
        eventName: defaultVariant.eventName,
        name: humanizeEventName(defaultVariant.eventName),
        description: defaultVariant.subtitle || "",
        defaultLanguage,
        availableLanguages,
        updatedAt: new Date(updatedAt || Date.now()).toISOString(),
        variantsByLanguage,
      };
    })
    .sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
}

export function TemplatesManager({ appId }: TemplatesManagerProps) {
  const ttRaw = useScopedTranslation("components", "TemplatesManager");
  const tt = (
    key: string,
    params?: Record<string, string | number>,
    fallback?: string,
  ) => ttRaw(key, fallback || key, params);
  const authFetch = useAuthenticatedFetch();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [view, setView] = useState<TemplatesView>("manage");

  // Editor State
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(
    null,
  );
  const [editingContent, setEditingContent] = useState<TemplateContent | null>(
    null,
  );
  const [activeLang, setActiveLang] = useState("en");
  const [isSaving, setIsSaving] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [createForm, setCreateForm] =
    useState<CreateTemplateForm>(DEFAULT_CREATE_FORM);
  const [createTargetField, setCreateTargetField] =
    useState<CreateTargetField>("body");
  const [customCreateVariable, setCustomCreateVariable] = useState("");
  const [languageToAdd, setLanguageToAdd] = useState("");
  const [previewPlatform, setPreviewPlatform] =
    useState<PreviewPlatform>("android");

  const resetCreateState = () => {
    setCreateForm(DEFAULT_CREATE_FORM);
    setCustomCreateVariable("");
    setCreateTargetField("body");
  };

  const openCreatePage = () => {
    setErrorMessage(null);
    resetCreateState();
    setView("create");
  };

  const closeCreatePage = () => {
    setErrorMessage(null);
    resetCreateState();
    setView("manage");
  };

  const loadTemplates = useCallback(async (): Promise<Template[]> => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const data = await authFetch<ApiTemplate[]>(`/templates?appId=${appId}`);
      const records = Array.isArray(data) ? data : [];
      const grouped = groupTemplates(records);
      setTemplates(grouped);
      return grouped;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to load templates";
      setErrorMessage(message);
      console.error("Failed to load templates:", error);
      return [];
    } finally {
      setIsLoading(false);
    }
  }, [appId, authFetch]);

  useEffect(() => {
    setSelectedTemplate(null);
    setEditingContent(null);
    setActiveLang("en");
    setView("manage");
    void loadTemplates();
  }, [loadTemplates]);

  const handleSelectTemplate = (template: Template) => {
    if (selectedTemplate?.key === template.key) {
      setSelectedTemplate(null);
      setEditingContent(null);
      setActiveLang("en");
      return;
    }

    const defaultLanguage = template.availableLanguages.includes(
      template.defaultLanguage,
    )
      ? template.defaultLanguage
      : template.availableLanguages[0] || "en";
    setSelectedTemplate(template);
    setActiveLang(defaultLanguage);
    setEditingContent(buildEditingContent(template, defaultLanguage));
    setErrorMessage(null);
  };

  const clearSelectedTemplate = () => {
    setSelectedTemplate(null);
    setEditingContent(null);
    setActiveLang("en");
    setLanguageToAdd("");
  };

  const handleLangSwitch = (langCode: string) => {
    if (!selectedTemplate) return;
    setActiveLang(langCode);
    setEditingContent(buildEditingContent(selectedTemplate, langCode));
  };

  const handleAddLanguage = () => {
    if (!selectedTemplate || !languageToAdd) return;
    if (selectedTemplate.availableLanguages.includes(languageToAdd)) return;

    const updatedTemplate: Template = {
      ...selectedTemplate,
      availableLanguages: [...selectedTemplate.availableLanguages, languageToAdd],
    };
    setSelectedTemplate(updatedTemplate);
    setActiveLang(languageToAdd);
    setEditingContent(buildEditingContent(updatedTemplate, languageToAdd));
    setLanguageToAdd("");
  };

  const handleSaveContent = async () => {
    if (!selectedTemplate || !editingContent) return;
    setIsSaving(true);
    setErrorMessage(null);
    try {
      const existingVariant =
        selectedTemplate.variantsByLanguage[editingContent.language];

      if (existingVariant) {
        const mergedVariables = Array.from(
          new Set([
            ...(existingVariant.variables || []),
            ...extractTemplateVariables(
              editingContent.title,
              editingContent.body,
            ),
          ]),
        );
        await authFetch(`/templates/${existingVariant.id}`, {
          method: "PUT",
          body: JSON.stringify({
            title: editingContent.title,
            subtitle: editingContent.subtitle,
            body: editingContent.body,
            variables: mergedVariables,
          }),
        });
      } else {
        const mergedVariables = Array.from(
          new Set([
            ...(selectedTemplate.variantsByLanguage[
              selectedTemplate.defaultLanguage
            ]?.variables || []),
            ...extractTemplateVariables(
              editingContent.title,
              editingContent.body,
            ),
          ]),
        );
        await authFetch("/templates", {
          method: "POST",
          body: JSON.stringify({
            appId: selectedTemplate.appId,
            type: selectedTemplate.type,
            eventName: selectedTemplate.eventName,
            language: editingContent.language,
            title: editingContent.title,
            subtitle: editingContent.subtitle || undefined,
            body: editingContent.body,
            variables: mergedVariables,
          }),
        });
      }

      const refreshedTemplates = await loadTemplates();
      const refreshed = refreshedTemplates.find(
        (template) => template.key === selectedTemplate.key,
      );
      if (refreshed) {
        setSelectedTemplate(refreshed);
        setActiveLang(editingContent.language);
        setEditingContent(
          buildEditingContent(refreshed, editingContent.language),
        );
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to save template";
      setErrorMessage(message);
      console.error("Failed to save template content", error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateTemplate = async () => {
    if (
      !createForm.name.trim() ||
      !createForm.title.trim() ||
      !createForm.body.trim()
    ) {
      setErrorMessage("Name, title, and body are required.");
      return;
    }

    setIsCreating(true);
    setErrorMessage(null);
    const templateVariables = extractTemplateVariables(
      createForm.title,
      createForm.body,
    );

    try {
      const createdTemplate = await authFetch<ApiTemplate>("/templates", {
        method: "POST",
        body: JSON.stringify({
          appId,
          name: createForm.name,
          language: createForm.language,
          title: createForm.title,
          body: createForm.body,
          variables: templateVariables,
        }),
      });

      const refreshedTemplates = await loadTemplates();
      closeCreatePage();

      const created = refreshedTemplates.find(
        (template) =>
          template.id === createdTemplate.id ||
          Object.values(template.variantsByLanguage).some(
            (variant) => variant.id === createdTemplate.id,
          ),
      );
      if (created) {
        handleSelectTemplate(created);
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to create template";
      setErrorMessage(message);
      console.error("Failed to create template", error);
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteTemplate = async () => {
    if (!selectedTemplate) return;

    const shouldDelete = window.confirm(
      `Delete "${selectedTemplate.name}" in all languages?`,
    );
    if (!shouldDelete) return;

    setIsSaving(true);
    setErrorMessage(null);
    try {
      await Promise.all(
        Object.values(selectedTemplate.variantsByLanguage).map((variant) =>
          authFetch(`/templates/${variant.id}`, { method: "DELETE" }),
        ),
      );
      setSelectedTemplate(null);
      setEditingContent(null);
      setActiveLang("en");
      await loadTemplates();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to delete template";
      setErrorMessage(message);
      console.error("Failed to delete template", error);
    } finally {
      setIsSaving(false);
    }
  };

  const filteredTemplates = useMemo(
    () =>
      templates.filter(
        (template) =>
          template.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          template.eventName.toLowerCase().includes(searchTerm.toLowerCase()) ||
          template.id.toLowerCase().includes(searchTerm.toLowerCase()),
      ),
    [templates, searchTerm],
  );

  const languageMetaByCode = useMemo(
    () => new Map(SUPPORTED_LANGUAGES.map((language) => [language.code, language])),
    [],
  );

  const languageTabs = useMemo(
    () =>
      (selectedTemplate?.availableLanguages || []).map((code) => {
        const knownLanguage = languageMetaByCode.get(code);
        return (
          knownLanguage || {
            code,
            name: code.toUpperCase(),
            dir: "ltr" as const,
          }
        );
      }),
    [selectedTemplate, languageMetaByCode],
  );

  const addableLanguages = useMemo(
    () =>
      SUPPORTED_LANGUAGES.filter(
        (language) =>
          !selectedTemplate?.availableLanguages.includes(language.code),
      ),
    [selectedTemplate],
  );

  useEffect(() => {
    if (!selectedTemplate) {
      setLanguageToAdd("");
      return;
    }
    const nextLanguage = addableLanguages[0]?.code || "";
    setLanguageToAdd(nextLanguage);
  }, [selectedTemplate, addableLanguages]);

  const activeLangInfo =
    languageTabs.find((language) => language.code === activeLang) ||
    languageMetaByCode.get(activeLang) ||
    SUPPORTED_LANGUAGES[0];

  const createVariablesPreview = useMemo(
    () => extractTemplateVariables(createForm.title, createForm.body),
    [createForm.title, createForm.body],
  );

  const editorVariables = useMemo(() => {
    const fromTemplate = Object.values(
      selectedTemplate?.variantsByLanguage || {},
    ).flatMap((variant) => variant.variables || []);
    const fromContent = editingContent
      ? extractTemplateVariables(editingContent.title, editingContent.body)
      : [];
    const merged = Array.from(new Set([...fromTemplate, ...fromContent]));
    return merged.length > 0 ? merged : PREDEFINED_TEMPLATE_VARIABLES;
  }, [selectedTemplate, editingContent]);

  const insertVariable = (variableName: string, target: "title" | "body") => {
    const normalizedVariable = normalizeVariableName(variableName);
    if (!normalizedVariable) return;
    setEditingContent((previous) => {
      if (!previous) return previous;
      return {
        ...previous,
        [target]: appendVariableToken(previous[target], normalizedVariable),
      };
    });
  };

  const insertCreateVariable = (variableName: string) => {
    const normalizedVariable = normalizeVariableName(variableName);
    if (!normalizedVariable) return;
    setCreateForm((previous) => ({
      ...previous,
      [createTargetField]: appendVariableToken(
        previous[createTargetField],
        normalizedVariable,
      ),
    }));
  };

  const handleAddCustomCreateVariable = () => {
    if (!customCreateVariable.trim()) return;
    insertCreateVariable(customCreateVariable);
    setCustomCreateVariable("");
  };

  if (view === "create") {
    return (
      <div className="h-[calc(100vh-12rem)] bg-white rounded-3xl border border-gray-100 overflow-hidden shadow-sm animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="h-full flex flex-col">
          {/* <div className="p-8 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h3 className="text-2xl font-black text-gray-900">New Template</h3>
              <p className="text-sm text-gray-500 mt-1">
                Define a reusable notification blueprint
              </p>
            </div>
            <Button
              variant="ghost"
              className="rounded-xl gap-2"
              onClick={closeCreatePage}
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Templates
            </Button>
          </div> */}

          <div className="flex-1 overflow-y-auto p-8">
            <div className="max-w-4xl mx-auto space-y-6">
              {errorMessage && (
                <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {errorMessage}
                </div>
              )}
              <div className="flex flex-row items-center space-x-4 w-full">
                <div className="space-y-2 w-full">
                  <label className="text-sm font-bold text-gray-700 ms-1">
                    {tt("Template Name")}
                  </label>
                  <input
                    type="text"
                    placeholder={tt("e.g., Order Confirmation")}
                    value={createForm.name}
                    onChange={(e) =>
                      setCreateForm((prev) => ({
                        ...prev,
                        name: e.target.value,
                      }))
                    }
                    className="w-full px-5 py-3 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                  />
                </div>
                <div className="space-y-2 w-full">
                  <label className="text-sm font-bold text-gray-700 ms-1">
                    {tt("Default Language")}
                  </label>
                  <select
                    value={createForm.language}
                    onChange={(e) =>
                      setCreateForm((prev) => ({
                        ...prev,
                        language: e.target
                          .value as CreateTemplateForm["language"],
                      }))
                    }
                    className="w-full px-5 py-3 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                  >
                    {SUPPORTED_LANGUAGES.map((language) => (
                      <option key={language.code} value={language.code}>
                        {tt(`language_${language.code}`, undefined, language.name)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {/* <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-gray-700 ms-1">
                    Type
                  </label>
                  <select
                    value={createForm.type}
                    onChange={(e) =>
                      setCreateForm((prev) => ({
                        ...prev,
                        type: e.target.value as TemplateType,
                      }))
                    }
                    className="w-full px-5 py-3 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                  >
                    {TEMPLATE_TYPES.map((typeOption) => (
                      <option key={typeOption.value} value={typeOption.value}>
                        {typeOption.label}
                      </option>
                    ))}
                  </select>
                </div>

               
              </div> */}

              <div className="space-y-2">
                <label className="text-sm font-bold text-gray-700 ms-1">
                  {tt("Initial Title")}
                </label>
                <input
                  type="text"
                  placeholder={tt("e.g., Order confirmed {{orderId}}")}
                  value={createForm.title}
                  onFocus={() => setCreateTargetField("title")}
                  onChange={(e) =>
                    setCreateForm((prev) => ({
                      ...prev,
                      title: e.target.value,
                    }))
                  }
                  className="w-full px-5 py-3 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                />
              </div>

              {/* <div className="space-y-2">
                <label className="text-sm font-bold text-gray-700 ms-1">
                  Description
                </label>
                <textarea
                  placeholder="Sent when customer successfully pays..."
                  rows={3}
                  value={createForm.description}
                  onChange={(e) =>
                    setCreateForm((prev) => ({
                      ...prev,
                      description: e.target.value,
                    }))
                  }
                  className="w-full px-5 py-3 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                ></textarea>
              </div> */}

              <div className="space-y-2">
                <label className="text-sm font-bold text-gray-700 ms-1">
                  {tt("Initial Body")}
                </label>
                <textarea
                  placeholder={tt(
                    "Write the notification body... e.g. Hi {{userName}}, your order {{orderId}} is on the way.",
                  )}
                  rows={4}
                  value={createForm.body}
                  onFocus={() => setCreateTargetField("body")}
                  onChange={(e) =>
                    setCreateForm((prev) => ({ ...prev, body: e.target.value }))
                  }
                  className="w-full px-5 py-3 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                ></textarea>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-bold text-gray-700 ms-1">
                    {tt("Template Variables")}
                  </label>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={
                        createTargetField === "title" ? "default" : "outline"
                      }
                      className="h-7 px-3 text-xs rounded-lg"
                      onClick={() => setCreateTargetField("title")}
                    >
                      {tt("Insert to title")}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={
                        createTargetField === "body" ? "default" : "outline"
                      }
                      className="h-7 px-3 text-xs rounded-lg"
                      onClick={() => setCreateTargetField("body")}
                    >
                      {tt("Insert to body")}
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-gray-500">
                  {tt("Click a variable to add it as")}{" "}
                  <code>{"{{variableName}}"}</code>.
                </p>

                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder={tt("Custom variable (e.g. trackingId)")}
                    value={customCreateVariable}
                    onChange={(e) => setCustomCreateVariable(e.target.value)}
                    className="flex-1 px-4 py-2 bg-gray-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-10 px-4 rounded-xl"
                    onClick={handleAddCustomCreateVariable}
                  >
                    {tt("Add")}
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {PREDEFINED_TEMPLATE_VARIABLES.map((variableName) => (
                    <Button
                      key={variableName}
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 px-3 text-xs rounded-lg"
                      onClick={() => insertCreateVariable(variableName)}
                    >
                      {`{{${variableName}}}`}
                    </Button>
                  ))}
                </div>
                <div className="rounded-xl border border-gray-100 bg-gray-50/70 p-3">
                  <p className="text-[11px] uppercase tracking-wide text-gray-500 font-semibold mb-2">
                    {tt("Variables detected")}
                  </p>
                  {createVariablesPreview.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {createVariablesPreview.map((variableName) => (
                        <span
                          key={variableName}
                          className="px-2 py-1 rounded-lg bg-white border border-gray-200 text-xs font-mono text-gray-700"
                        >
                          {`{{${variableName}}}`}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-500">
                      {tt(
                        "Add placeholders in title/body to register template variables.",
                      )}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="p-8 bg-gray-50 border-t border-gray-100 flex justify-end gap-3">
            <Button
              variant="outline"
              onClick={closeCreatePage}
              className="rounded-xl px-6"
            >
              {tt("Cancel")}
            </Button>
            <Button
              className="rounded-xl px-8 shadow-lg shadow-blue-500/20"
              onClick={handleCreateTemplate}
              disabled={isCreating}
            >
              {isCreating ? (
                <>
                  <Clock className="w-4 h-4 animate-spin me-2" />
                  {tt("Creating...")}
                </>
              ) : (
                tt("Create Template")
              )}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-12rem)] bg-white rounded-3xl border border-gray-100 overflow-hidden shadow-sm animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Sidebar: Template List */}
      <div className="w-80 border-e border-gray-100 flex flex-col bg-gray-50/30">
        <div className="p-6 border-b border-gray-100 bg-white">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-gray-900 flex items-center gap-2">
              <FileText className="w-5 h-5 text-blue-600" />
              {tt("Templates")}
            </h3>
            <Button
              variant="ghost"
              size="icon"
              onClick={openCreatePage}
              className="rounded-xl h-8 w-8"
            >
              <Plus className="w-4 h-4" />
            </Button>
          </div>
          <div className="relative">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder={tt("Search templates...")}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full ps-9 pe-4 py-2 bg-gray-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
            />
          </div>
        </div>

        <div
          className="flex-1 overflow-y-auto p-4 space-y-2"
          onClick={() => {
            if (selectedTemplate) {
              clearSelectedTemplate();
            }
          }}
        >
          {errorMessage && (
            <div className="mb-2 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700">
              {errorMessage}
            </div>
          )}
          {isLoading ? (
            Array(3)
              .fill(0)
              .map((_, i) => (
                <div
                  key={i}
                  className="h-16 bg-white rounded-2xl animate-pulse border border-gray-50"
                />
              ))
          ) : filteredTemplates.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="w-10 h-10 text-gray-200 mx-auto mb-3" />
              <p className="text-xs text-gray-400">{tt("No templates found")}</p>
              <Button
                size="sm"
                className="mt-4 rounded-xl px-4"
                onClick={openCreatePage}
              >
                <Plus className="w-3 h-3 me-1" />
                {tt("Create first template")}
              </Button>
            </div>
          ) : (
            filteredTemplates.map((template) => (
              <button
                key={template.id}
                onClick={(e) => {
                  e.stopPropagation();
                  handleSelectTemplate(template);
                }}
                className={clsx(
                  "w-full p-4 rounded-2xl text-start transition-all border group",
                  selectedTemplate?.id === template.id
                    ? "bg-blue-600 border-blue-600 shadow-lg shadow-blue-500/20 text-white"
                    : "bg-white border-transparent hover:border-gray-100 hover:bg-white",
                )}
              >
                <h4 className="font-bold text-sm truncate">{template.name}</h4>
                <div className="flex items-center gap-2 mt-2">
                  <div className="flex -space-x-1">
                    {template.availableLanguages.slice(0, 3).map((lang) => (
                      <div
                        key={lang}
                        className={clsx(
                          "w-5 h-5 rounded-full border-2 flex items-center justify-center text-[8px] font-bold uppercase",
                          selectedTemplate?.id === template.id
                            ? "bg-blue-500 border-blue-600"
                            : "bg-gray-100 border-white",
                        )}
                      >
                        {lang}
                      </div>
                    ))}
                  </div>
                  <span
                    className={clsx(
                      "text-[10px] font-medium opacity-60",
                      selectedTemplate?.id === template.id
                        ? "text-white"
                        : "text-gray-400",
                    )}
                  >
                    {tt("{{count}} languages", {
                      count: template.availableLanguages.length,
                    })}
                  </span>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Main Editor / Detail */}
      <div className="flex-1 flex flex-col bg-white">
        {!selectedTemplate ? (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
            <div className="w-20 h-20 bg-gray-50 rounded-[2.5rem] flex items-center justify-center mb-6">
              <Layout className="w-10 h-10 text-gray-200" />
            </div>
            <h4 className="text-xl font-bold text-gray-900 mb-2">
              {tt("Select a Template")}
            </h4>
            <p className="text-sm text-gray-400 max-w-xs mx-auto">
              {tt(
                "Choose a template from the list to edit its content and manage multi-language support.",
              )}
            </p>
          </div>
        ) : (
          <>
            {/* Editor Header */}
            <div className="p-6 border-b border-gray-100 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-3 flex-wrap">
                  <h3 className="text-2xl font-black text-gray-900 truncate">
                    {selectedTemplate.name}
                  </h3>
                  <span
                    title={selectedTemplate.id}
                    className="max-w-[22rem] truncate px-3 py-1 bg-blue-50 text-blue-600 text-[11px] font-bold rounded-xl uppercase tracking-wider"
                  >
                    {selectedTemplate.id}
                  </span>
                </div>
                <p className="text-sm text-gray-500 mt-1">
                  {selectedTemplate.description || selectedTemplate.eventName}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  className="rounded-xl px-4"
                  onClick={clearSelectedTemplate}
                  disabled={isSaving}
                >
                  {tt("Unselect")}
                </Button>
                <Button
                  variant="ghost"
                  className="rounded-xl px-4 gap-2 text-red-600 hover:bg-red-50 hover:text-red-700"
                  onClick={handleDeleteTemplate}
                  disabled={isSaving}
                >
                  <Trash2 className="w-4 h-4" />
                  {tt("Delete")}
                </Button>
                <Button
                  onClick={handleSaveContent}
                  disabled={isSaving}
                  className="rounded-xl px-6 gap-2 shadow-lg shadow-blue-500/20"
                >
                  {isSaving ? (
                    <Clock className="w-4 h-4 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  {tt("Save Changes")}
                </Button>
              </div>
            </div>

            {/* Language Selector Tabs */}
            <div className="px-6 py-3 bg-gray-50/70 border-b border-gray-100">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
                  <div className="h-10 w-10 rounded-xl bg-white border border-gray-200 flex items-center justify-center shrink-0">
                    <Languages className="w-4 h-4 text-gray-500" />
                  </div>
                  {languageTabs.map((lang) => (
                    <button
                      key={lang.code}
                      onClick={() => handleLangSwitch(lang.code)}
                      className={clsx(
                        "px-5 py-2.5 rounded-2xl text-[15px] font-bold transition-all shrink-0 border",
                        activeLang === lang.code
                          ? "bg-white border-blue-200 text-blue-600 shadow-sm"
                          : "bg-transparent border-transparent text-gray-500 hover:text-gray-700 hover:bg-white/70",
                      )}
                    >
                        {lang.name}
                      <span className="inline-block w-2 h-2 bg-green-500 rounded-full ms-2 align-middle" />
                    </button>
                  ))}
                </div>

                {addableLanguages.length > 0 && (
                  <div className="flex items-center gap-2 shrink-0">
                    <select
                      value={languageToAdd}
                      onChange={(e) => setLanguageToAdd(e.target.value)}
                      className="h-11 px-4 bg-white border border-gray-200 rounded-2xl text-sm font-medium text-gray-700 focus:ring-2 focus:ring-blue-500/20 outline-none"
                    >
                      {addableLanguages.map((language) => (
                        <option key={language.code} value={language.code}>
                          {language.name}
                        </option>
                      ))}
                    </select>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-11 rounded-2xl px-4 text-[15px]"
                      onClick={handleAddLanguage}
                      disabled={!languageToAdd}
                    >
                      <Plus className="w-4 h-4 me-1.5" />
                      {tt("Add")}
                    </Button>
                  </div>
                )}
              </div>
            </div>

            {/* Editor Layout */}
            <div className="flex-1 flex overflow-hidden">
              {/* Content Input */}
              <div className="flex-1 p-8 overflow-y-auto space-y-8 border-e border-gray-50">
                <section className="space-y-4">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                      <MessageSquare className="w-4 h-4" />
                      {tt("Notification Title")}
                    </label>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-[10px] font-bold text-blue-600 rounded-lg"
                      onClick={() => insertVariable("userName", "title")}
                    >
                      <Copy className="w-3 h-3 me-1" /> {tt("Variable")}
                    </Button>
                  </div>
                  <input
                    type="text"
                    placeholder={tt("Order arrived! {{orderId}}")}
                    value={editingContent?.title || ""}
                    onChange={(e) =>
                      setEditingContent((prev) =>
                        prev ? { ...prev, title: e.target.value } : null,
                      )
                    }
                    dir={activeLangInfo.dir}
                    className={clsx(
                      "w-full px-6 py-4 bg-white border border-gray-100 rounded-2xl text-lg font-bold focus:ring-4 focus:ring-blue-500/5 focus:border-blue-500/50 outline-none transition-all placeholder:text-gray-200 shadow-sm",
                      activeLangInfo.dir === "rtl" ? "text-end" : "text-start",
                    )}
                  />
                </section>

                <section className="space-y-4">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                      <AlignLeft className="w-4 h-4" />
                      {tt("Notification Subtitle")}
                    </label>
                  </div>
                  <input
                    type="text"
                    placeholder={tt("Optional short subtitle")}
                    value={editingContent?.subtitle || ""}
                    onChange={(e) =>
                      setEditingContent((prev) =>
                        prev ? { ...prev, subtitle: e.target.value } : null,
                      )
                    }
                    dir={activeLangInfo.dir}
                    className={clsx(
                      "w-full px-6 py-4 bg-white border border-gray-100 rounded-2xl text-sm focus:ring-4 focus:ring-blue-500/5 focus:border-blue-500/50 outline-none transition-all placeholder:text-gray-200 shadow-sm",
                      activeLangInfo.dir === "rtl" ? "text-end" : "text-start",
                    )}
                  />
                </section>

                <section className="space-y-4">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                      <Layout className="w-4 h-4" />
                      {tt("Notification Body")}
                    </label>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 rounded-lg"
                      >
                        <AlignLeft className="w-3 h-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 rounded-lg bg-gray-100"
                      >
                        <AlignRight className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                  <textarea
                    placeholder={tt("Your delicious burger is at your doorstep...")}
                    rows={6}
                    value={editingContent?.body || ""}
                    onChange={(e) =>
                      setEditingContent((prev) =>
                        prev ? { ...prev, body: e.target.value } : null,
                      )
                    }
                    dir={activeLangInfo.dir}
                    className={clsx(
                      "w-full px-6 py-4 bg-white border border-gray-100 rounded-2xl text-sm leading-relaxed focus:ring-4 focus:ring-blue-500/5 focus:border-blue-500/50 outline-none transition-all placeholder:text-gray-200 shadow-sm",
                      activeLangInfo.dir === "rtl" ? "text-end" : "text-start",
                    )}
                  ></textarea>
                </section>

                <section className="p-6 bg-blue-50/50 rounded-2xl border border-blue-100/50">
                  <h4 className="text-xs font-bold text-blue-900 uppercase tracking-wide mb-3 flex items-center gap-2">
                    <Globe className="w-4 h-4" />
                    Regional Best Practice
                    {tt("Regional Best Practice")}
                  </h4>
                  <p className="text-xs text-blue-700/70 leading-relaxed">
                    {activeLangInfo.dir === "rtl"
                      ? tt(
                          "Ensure punctuation is placed correctly for RTL text. Mobile devices correctly swap layout icons like back arrows automatically.",
                        )
                      : tt(
                          "Keep titles under 40 characters for best visibility across all mobile notification centers.",
                        )}
                  </p>
                </section>
              </div>

              {/* Live Preview Pane */}
              <div className="w-[430px] xl:w-[460px] p-6 bg-gradient-to-b from-slate-50 to-slate-100/80 border-s border-gray-100 flex flex-col">
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div>
                    <div className="text-xs uppercase tracking-wider text-slate-500 font-semibold">
                      {tt("Test environment")}
                    </div>
                    <h4 className="text-2xl font-semibold text-slate-900">
                      {tt("Live Preview")}
                    </h4>
                    <p className="text-xs text-slate-500 mt-1">
                      {tt("How this notification looks on-device")}
                    </p>
                  </div>
                  <div className="h-8 w-8 rounded-full bg-blue-50 text-blue-600 font-bold text-xs flex items-center justify-center border border-blue-100">
                    {activeLang.toUpperCase()}
                  </div>
                </div>

                <div className="inline-flex bg-white p-1 rounded-2xl border border-slate-200 shadow-sm mb-4">
                  {PREVIEW_PLATFORMS.map((platformOption) => (
                    <button
                      key={platformOption.value}
                      onClick={() => setPreviewPlatform(platformOption.value)}
                      className={clsx(
                        "px-3 py-1.5 text-xs font-bold rounded-xl transition-all",
                        previewPlatform === platformOption.value
                          ? "bg-slate-900 text-white shadow-sm"
                          : "text-slate-500 hover:text-slate-700",
                      )}
                    >
                      {tt(`platform_${platformOption.value}`, undefined, platformOption.label)}
                    </button>
                  ))}
                </div>

                <div className="relative rounded-[2rem] border border-slate-200/80 bg-gradient-to-b from-slate-100 via-slate-100 to-slate-200/90 shadow-inner overflow-hidden min-h-[560px]">
                  <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-white/80 to-transparent" />
                  <div
                    className={clsx(
                      "relative flex justify-center",
                      previewPlatform === "web" ? "pt-16" : "pt-3",
                    )}
                  >
                    <div
                      className={clsx(
                        "origin-top",
                        previewPlatform === "web" ? "scale-100" : "scale-[0.82]",
                      )}
                    >
                      <NotificationPreview
                        platform={previewPlatform}
                        title={editingContent?.title || tt("Notification Title")}
                        subtitle={editingContent?.subtitle || selectedTemplate.name}
                        body={
                          editingContent?.body ||
                          tt("Message body content goes here...")
                        }
                        direction={activeLangInfo.dir as "ltr" | "rtl"}
                      />
                    </div>
                  </div>
                </div>

                <div className="mt-4 space-y-3">
                  <h5 className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em]">
                    {tt("Metadata Variables")}
                  </h5>
                  <div className="grid grid-cols-2 gap-2">
                    {editorVariables.map((v) => (
                      <div
                        key={v}
                        className="px-3 py-2 bg-white rounded-xl border border-gray-100 text-[11px] font-mono text-gray-600 flex items-center justify-between group cursor-pointer hover:border-blue-200"
                        onClick={() => insertVariable(v, "body")}
                      >
                        <span>{v}</span>
                        <Plus className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
