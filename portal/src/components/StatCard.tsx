import type { ReactNode } from "react";
import { clsx } from "clsx";
import { Skeleton } from "./ui/Skeleton";

interface StatCardProps {
  title: string;
  value: string;
  color: "blue" | "green" | "red" | "purple";
  icon?: ReactNode;
  subtitle?: string;
  loading?: boolean;
}

export function StatCard({ title, value, color, icon, subtitle, loading }: StatCardProps) {
  const colorMap = {
    blue: {
      bg: "bg-blue-50",
      text: "text-blue-600",
      accent: "from-blue-500 to-blue-600",
    },
    green: {
      bg: "bg-emerald-50",
      text: "text-emerald-600",
      accent: "from-emerald-500 to-emerald-600",
    },
    red: {
      bg: "bg-rose-50",
      text: "text-rose-600",
      accent: "from-rose-500 to-rose-600",
    },
    purple: {
      bg: "bg-violet-50",
      text: "text-violet-600",
      accent: "from-violet-500 to-violet-600",
    },
  };

  const c = colorMap[color];

  return (
    <div className="group relative overflow-hidden rounded-2xl border border-slate-200/60 bg-white p-6 shadow-sm transition-all hover:shadow-md">
      <div
        className={clsx(
          "absolute -right-4 -top-4 h-24 w-24 rounded-full bg-gradient-to-br opacity-[0.07] transition-transform group-hover:scale-110",
          c.accent,
        )}
      />
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500">{title}</p>
          {loading ? (
            <Skeleton className="mt-2 h-9 w-24" />
          ) : (
            <p className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900">
              {value}
            </p>
          )}
          {subtitle && (
            <p className="mt-1 text-xs text-slate-400">{subtitle}</p>
          )}
        </div>
        {icon && (
          <div
            className={clsx(
              "flex h-10 w-10 items-center justify-center rounded-xl",
              c.bg,
              c.text,
            )}
          >
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}
