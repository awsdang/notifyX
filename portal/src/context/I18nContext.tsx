import {
  useCallback,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type PortalLanguage = "en" | "ar";
export type PortalDirection = "ltr" | "rtl";

type MessageDomain = "components" | "pages";

type MessageSection = Record<string, string>;

type MessageTree = Record<string, MessageSection>;

interface Messages {
  components: MessageTree;
  pages: MessageTree;
}

interface I18nContextValue {
  language: PortalLanguage;
  direction: PortalDirection;
  setLanguage: (language: PortalLanguage) => void;
  t: (
    domain: MessageDomain,
    section: string,
    key: string,
    fallback?: string,
    params?: Record<string, string | number>,
  ) => string;
}

const DEFAULT_LANGUAGE: PortalLanguage = "en";
const STORAGE_KEY = "notifyx.portal.language";

const I18nContext = createContext<I18nContextValue | null>(null);

function sanitizeLanguage(value: string | null): PortalLanguage {
  return value === "ar" ? "ar" : DEFAULT_LANGUAGE;
}

function resolveMessage(
  messages: Messages | null,
  domain: MessageDomain,
  section: string,
  key: string,
): string | undefined {
  return messages?.[domain]?.[section]?.[key];
}

function interpolate(
  template: string,
  params?: Record<string, string | number>,
): string {
  if (!params) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (match, token: string) => {
    const value = params[token];
    return value === undefined || value === null ? match : String(value);
  });
}

async function loadLanguageMessages(language: PortalLanguage): Promise<Messages> {
  const response = await fetch(`/i18n/${language}.json`, { cache: "no-cache" });
  if (!response.ok) {
    throw new Error(`Failed to load i18n messages for ${language}`);
  }
  return (await response.json()) as Messages;
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<PortalLanguage>(() => {
    if (typeof window === "undefined") return DEFAULT_LANGUAGE;
    const initialLanguage = sanitizeLanguage(
      window.localStorage.getItem(STORAGE_KEY),
    );
    const initialDirection: PortalDirection =
      initialLanguage === "ar" ? "rtl" : "ltr";
    document.documentElement.lang = initialLanguage;
    document.documentElement.dir = initialDirection;
    return initialLanguage;
  });

  const [messagesByLanguage, setMessagesByLanguage] = useState<
    Partial<Record<PortalLanguage, Messages>>
  >({});

  useEffect(() => {
    const activeDirection: PortalDirection = language === "ar" ? "rtl" : "ltr";
    document.documentElement.lang = language;
    document.documentElement.dir = activeDirection;
  }, [language]);

  useEffect(() => {
    let mounted = true;

    const ensureMessages = async () => {
      const targets: PortalLanguage[] = ["en", "ar"];
      const missing = targets.filter((code) => !messagesByLanguage[code]);
      if (missing.length === 0) return;

      try {
        const loaded = await Promise.all(
          missing.map(async (code) => ({
            code,
            data: await loadLanguageMessages(code),
          })),
        );

        if (!mounted) return;

        setMessagesByLanguage((prev) => {
          const next = { ...prev };
          for (const { code, data } of loaded) {
            next[code] = data;
          }
          return next;
        });
      } catch (error) {
        console.error("Failed to load i18n messages", error);
      }
    };

    void ensureMessages();

    return () => {
      mounted = false;
    };
  }, [messagesByLanguage]);

  const setLanguage = useCallback((nextLanguage: PortalLanguage) => {
    setLanguageState(nextLanguage);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, nextLanguage);
    }
  }, []);

  const value = useMemo<I18nContextValue>(() => {
    const fallbackMessages = messagesByLanguage.en ?? null;
    const activeMessages = messagesByLanguage[language] ?? null;
    const direction: PortalDirection = language === "ar" ? "rtl" : "ltr";

    const t = (
      domain: MessageDomain,
      section: string,
      key: string,
      fallback?: string,
      params?: Record<string, string | number>,
    ) => {
      const translated =
        resolveMessage(activeMessages, domain, section, key) ??
        resolveMessage(fallbackMessages, domain, section, key) ??
        fallback ??
        key;

      return interpolate(translated, params);
    };

    return {
      language,
      direction,
      setLanguage,
      t,
    };
  }, [language, messagesByLanguage, setLanguage]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n must be used within I18nProvider");
  }
  return context;
}

export function useScopedTranslation(domain: MessageDomain, section: string) {
  const { t } = useI18n();

  return useCallback(
    (
      key: string,
      fallback?: string,
      params?: Record<string, string | number>,
    ) => t(domain, section, key, fallback, params),
    [domain, section, t],
  );
}
