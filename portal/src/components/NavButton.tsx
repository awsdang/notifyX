import { clsx } from 'clsx';
import type { ReactNode } from 'react';

interface NavButtonProps {
    children: ReactNode;
    active: boolean;
    onClick: () => void;
    icon: ReactNode;
}

export function NavButton({ children, active, onClick, icon }: NavButtonProps) {
    return (
        <button
            onClick={onClick}
            className={clsx(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all text-left",
                active
                    ? "bg-gradient-to-r from-blue-50 to-purple-50 text-blue-700 shadow-sm"
                    : "text-gray-600 hover:bg-gray-50"
            )}
        >
            {icon}
            {children}
        </button>
    );
}
