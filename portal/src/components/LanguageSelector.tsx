import { Globe } from "lucide-react";
import { useI18n, useScopedTranslation } from "../context/I18nContext";
import { cn } from "../helpers/utils";

export function LanguageSelector({ className }: { className?: string }) {
  const { language, setLanguage } = useI18n();
  const tc = useScopedTranslation("components", "common");

  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-1",
        className,
      )}
    >
      <div className="ps-2 pe-1 text-slate-500">
        <Globe className="h-4 w-4" />
      </div>
      <button
        type="button"
        onClick={() => setLanguage("en")}
        className={cn(
          "rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors",
          language === "en"
            ? "bg-slate-900 text-white"
            : "text-slate-600 hover:bg-slate-100",
        )}
      >
        {tc("languageEnglish", "English")}
      </button>
      <button
        type="button"
        onClick={() => setLanguage("ar")}
        className={cn(
          "rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors",
          language === "ar"
            ? "bg-slate-900 text-white"
            : "text-slate-600 hover:bg-slate-100",
        )}
      >
        {tc("languageArabic", "العربية")}
      </button>
    </div>
  );
}
