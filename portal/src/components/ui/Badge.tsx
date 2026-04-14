import { clsx } from "clsx";
import type { ReactNode } from "react";

type BadgeVariant =
  | "default"
  | "success"
  | "warning"
  | "error"
  | "info"
  | "outline";

interface BadgeProps {
  children: ReactNode;
  variant?: BadgeVariant;
  className?: string;
  dot?: boolean;
}

const variantStyles: Record<BadgeVariant, string> = {
  default: "bg-slate-100 text-slate-700",
  success: "bg-emerald-50 text-emerald-700 border-emerald-100",
  warning: "bg-amber-50 text-amber-700 border-amber-100",
  error: "bg-rose-50 text-rose-700 border-rose-100",
  info: "bg-blue-50 text-blue-700 border-blue-100",
  outline: "bg-white text-slate-600 border-slate-200",
};

const dotStyles: Record<BadgeVariant, string> = {
  default: "bg-slate-400",
  success: "bg-emerald-500",
  warning: "bg-amber-500",
  error: "bg-rose-500",
  info: "bg-blue-500",
  outline: "bg-slate-400",
};

export function Badge({
  children,
  variant = "default",
  className,
  dot = false,
}: BadgeProps) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold",
        variantStyles[variant],
        className,
      )}
    >
      {dot && (
        <span
          className={clsx("h-1.5 w-1.5 rounded-full", dotStyles[variant])}
        />
      )}
      {children}
    </span>
  );
}

export function StatusBadge({
  status,
}: {
  status: string;
}) {
  const map: Record<string, { variant: BadgeVariant; label: string }> = {
    DRAFT: { variant: "default", label: "Draft" },
    SCHEDULED: { variant: "info", label: "Scheduled" },
    PROCESSING: { variant: "warning", label: "Processing" },
    SENDING: { variant: "warning", label: "Sending" },
    COMPLETED: { variant: "success", label: "Completed" },
    SENT: { variant: "success", label: "Sent" },
    DELIVERED: { variant: "success", label: "Delivered" },
    FAILED: { variant: "error", label: "Failed" },
    CANCELLED: { variant: "default", label: "Cancelled" },
    PENDING: { variant: "info", label: "Pending" },
    ACTIVE: { variant: "success", label: "Active" },
    PAUSED: { variant: "warning", label: "Paused" },
  };

  const config = map[status] || { variant: "default" as BadgeVariant, label: status };
  return (
    <Badge variant={config.variant} dot>
      {config.label}
    </Badge>
  );
}
