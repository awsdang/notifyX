import { useAppContext } from "../context/AppContext";
import { ChevronDown } from "lucide-react";
import { useState, useRef, useEffect } from "react";

export function AppSelector() {
  const { apps, selectedApp, setSelectedApp } = useAppContext();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  if (apps.length <= 1) return null;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
      >
        <div className="flex h-5 w-5 items-center justify-center rounded-md bg-gradient-to-br from-slate-900 to-slate-600 text-[10px] font-bold text-white">
          {selectedApp?.name?.charAt(0)?.toUpperCase() || "?"}
        </div>
        <span className="max-w-[120px] truncate">{selectedApp?.name || "Select app"}</span>
        <ChevronDown size={14} className={`text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-56 rounded-xl border border-slate-200 bg-white py-1 shadow-xl">
          {apps.map((app) => (
            <button
              key={app.id}
              onClick={() => {
                setSelectedApp(app);
                setOpen(false);
              }}
              className={`flex w-full items-center gap-2 px-3 py-2 text-start text-sm transition-colors hover:bg-slate-50 ${
                selectedApp?.id === app.id
                  ? "bg-blue-50 text-blue-700 font-medium"
                  : "text-slate-700"
              }`}
            >
              <div className="flex h-5 w-5 items-center justify-center rounded-md bg-gradient-to-br from-slate-900 to-slate-600 text-[10px] font-bold text-white">
                {app.name.charAt(0).toUpperCase()}
              </div>
              <span className="truncate">{app.name}</span>
              {app.isKilled && (
                <span className="ml-auto text-[10px] font-bold text-red-500">OFF</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
