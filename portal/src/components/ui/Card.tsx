import { clsx } from "clsx";
import type { ReactNode } from "react";

interface CardProps {
  children: ReactNode;
  className?: string;
  padding?: "sm" | "md" | "lg";
  hover?: boolean;
  onClick?: () => void;
}

export function Card({
  children,
  className,
  padding = "md",
  hover = false,
  onClick,
}: CardProps) {
  const paddings = {
    sm: "p-4",
    md: "p-6",
    lg: "p-8",
  };

  return (
    <div
      onClick={onClick}
      className={clsx(
        "rounded-2xl border border-slate-200/60 bg-white shadow-sm",
        paddings[padding],
        hover &&
          "cursor-pointer transition-all hover:border-blue-200 hover:shadow-md",
        onClick && "cursor-pointer",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={clsx("mb-4 flex items-center justify-between", className)}>
      {children}
    </div>
  );
}

export function CardTitle({
  children,
  icon,
  className,
}: {
  children: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <h3
      className={clsx(
        "flex items-center gap-2 text-lg font-bold text-slate-900",
        className,
      )}
    >
      {icon}
      {children}
    </h3>
  );
}
