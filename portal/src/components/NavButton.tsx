import { clsx } from "clsx";
import type { ReactNode } from "react";

interface NavButtonProps {
  children: ReactNode;
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  disabled?: boolean;
}

export function NavButton({
  children,
  active,
  onClick,
  icon,
  disabled = false,
}: NavButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        "flex items-center gap-3 rounded-lg px-3 py-2.5 text-start text-sm font-medium transition-all",
        active
          ? "bg-linear-to-r from-blue-50 to-purple-50 text-blue-700 shadow-sm"
          : "text-gray-600 hover:bg-gray-50",
        disabled && "cursor-not-allowed opacity-40 hover:bg-transparent",
      )}
    >
      {icon}
      {children}
    </button>
  );
}
