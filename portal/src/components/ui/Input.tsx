import { forwardRef, type InputHTMLAttributes } from "react";
import { clsx } from "clsx";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, hint, id, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, "-");
    return (
      <div className="space-y-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-sm font-medium text-slate-700"
          >
            {label}
            {props.required && <span className="ml-0.5 text-rose-500">*</span>}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={clsx(
            "w-full rounded-xl border bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm transition-all",
            "placeholder:text-slate-400",
            "focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20",
            "disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400",
            error
              ? "border-rose-300 focus:border-rose-500 focus:ring-rose-500/20"
              : "border-slate-200",
            className,
          )}
          {...props}
        />
        {error && <p className="text-xs font-medium text-rose-600">{error}</p>}
        {hint && !error && (
          <p className="text-xs text-slate-500">{hint}</p>
        )}
      </div>
    );
  },
);
Input.displayName = "Input";

export interface SelectProps
  extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, label, error, children, id, ...props }, ref) => {
    const selectId = id || label?.toLowerCase().replace(/\s+/g, "-");
    return (
      <div className="space-y-1.5">
        {label && (
          <label
            htmlFor={selectId}
            className="block text-sm font-medium text-slate-700"
          >
            {label}
          </label>
        )}
        <select
          ref={ref}
          id={selectId}
          className={clsx(
            "w-full rounded-xl border bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm transition-all",
            "focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20",
            "disabled:cursor-not-allowed disabled:bg-slate-50",
            error
              ? "border-rose-300 focus:border-rose-500 focus:ring-rose-500/20"
              : "border-slate-200",
            className,
          )}
          {...props}
        >
          {children}
        </select>
        {error && <p className="text-xs font-medium text-rose-600">{error}</p>}
      </div>
    );
  },
);
Select.displayName = "Select";

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, label, error, id, ...props }, ref) => {
    const textareaId = id || label?.toLowerCase().replace(/\s+/g, "-");
    return (
      <div className="space-y-1.5">
        {label && (
          <label
            htmlFor={textareaId}
            className="block text-sm font-medium text-slate-700"
          >
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={textareaId}
          className={clsx(
            "w-full rounded-xl border bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm transition-all",
            "placeholder:text-slate-400",
            "focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20",
            "disabled:cursor-not-allowed disabled:bg-slate-50",
            error
              ? "border-rose-300 focus:border-rose-500 focus:ring-rose-500/20"
              : "border-slate-200",
            className,
          )}
          {...props}
        />
        {error && <p className="text-xs font-medium text-rose-600">{error}</p>}
      </div>
    );
  },
);
Textarea.displayName = "Textarea";
