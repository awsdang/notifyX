export type TemplateType = "transactional" | "campaign";

export interface ApiTemplateRecord {
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

export interface GroupedTemplate {
  id: string;
  key: string;
  appId: string;
  type: TemplateType;
  eventName: string;
  name: string;
  defaultLanguage: string;
  availableLanguages: string[];
  variantsByLanguage: Record<string, ApiTemplateRecord>;
}

function normalizeVariableName(variableName: string): string {
  return variableName
    .trim()
    .replace(/^[{]+|[}]+$/g, "")
    .replace(/\s+/g, "")
    .replace(/[^a-zA-Z0-9_.-]/g, "");
}

function humanizeEventName(eventName: string): string {
  return eventName
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function extractTemplateVariables(...texts: Array<string | null | undefined>): string[] {
  const matches = new Set<string>();
  const pattern = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g;

  for (const text of texts) {
    if (!text) continue;
    for (const match of text.matchAll(pattern)) {
      const variableName = normalizeVariableName(match[1] || "");
      if (variableName) {
        matches.add(variableName);
      }
    }
  }

  return Array.from(matches);
}

export function applyTemplateVariables(
  text: string | null | undefined,
  values: Record<string, string>,
): string {
  if (!text) return "";
  return text.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_, key: string) => {
    const normalized = normalizeVariableName(key);
    if (!normalized) return "";
    return values[normalized] ?? "";
  });
}

export function groupTemplates(records: ApiTemplateRecord[]): GroupedTemplate[] {
  const grouped = new Map<string, ApiTemplateRecord[]>();

  for (const record of records) {
    const key = `${record.type}:${record.eventName}`;
    const entries = grouped.get(key) || [];
    entries.push(record);
    grouped.set(key, entries);
  }

  return Array.from(grouped.entries())
    .map(([key, entries]) => {
      const variantsByLanguage = entries.reduce<Record<string, ApiTemplateRecord>>(
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

      return {
        id: defaultVariant.id,
        key,
        appId: defaultVariant.appId,
        type: defaultVariant.type,
        eventName: defaultVariant.eventName,
        name: humanizeEventName(defaultVariant.eventName),
        defaultLanguage,
        availableLanguages,
        variantsByLanguage,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function pickTemplateLanguage(
  template: GroupedTemplate,
  preferredLanguage?: string,
): string {
  if (
    preferredLanguage &&
    template.availableLanguages.includes(preferredLanguage)
  ) {
    return preferredLanguage;
  }
  if (template.availableLanguages.includes(template.defaultLanguage)) {
    return template.defaultLanguage;
  }
  return template.availableLanguages[0] || "en";
}

export function resolveTemplateVariableKeys(
  template: GroupedTemplate | null,
  language: string,
): string[] {
  if (!template) return [];
  const variant = template.variantsByLanguage[language];
  if (!variant) return [];

  const fromDeclared = variant.variables || [];
  const fromContent = extractTemplateVariables(
    variant.title,
    variant.subtitle,
    variant.body,
  );

  return Array.from(new Set([...fromDeclared, ...fromContent]));
}

export function buildTemplateVariablePayload(
  variableKeys: string[],
  values: Record<string, string>,
): Record<string, string> {
  return variableKeys.reduce<Record<string, string>>((acc, key) => {
    acc[key] = values[key] ?? "";
    return acc;
  }, {});
}
