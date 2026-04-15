import {
  Children,
  forwardRef,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";
import { clsx } from "clsx";

export interface SelectProps
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "onChange" | "size"> {
  label?: string;
  error?: string;
  placeholder?: string;
  onChange?: (
    event: { target: { value: string; name?: string } },
  ) => void;
}

type OptionItem = {
  value: string;
  label: ReactNode;
  text: string;
  disabled?: boolean;
};

function extractText(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(extractText).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) {
    return extractText(node.props.children);
  }
  return "";
}

function collectOptions(children: ReactNode, out: OptionItem[]): void {
  Children.forEach(children, (child) => {
    if (child == null || typeof child === "boolean") return;
    if (Array.isArray(child)) {
      collectOptions(child, out);
      return;
    }
    if (!isValidElement(child)) return;
    const el = child as React.ReactElement<{
      value?: string | number;
      disabled?: boolean;
      children?: ReactNode;
    }>;
    if (el.type === "option") {
      const value =
        el.props.value == null ? extractText(el.props.children) : String(el.props.value);
      out.push({
        value,
        label: el.props.children,
        text: extractText(el.props.children),
        disabled: el.props.disabled,
      });
      return;
    }
    // Fragments / wrappers: recurse
    if (el.props && "children" in el.props) {
      collectOptions(el.props.children, out);
    }
  });
}

export const Select = forwardRef<HTMLDivElement, SelectProps>(
  (
    {
      className,
      label,
      error,
      children,
      id,
      value,
      defaultValue,
      onChange,
      name,
      disabled,
      required,
      placeholder,
      ...rest
    },
    ref,
  ) => {
    const reactId = useId();
    const selectId = id || `select-${reactId}`;

    const options = useMemo(() => {
      const out: OptionItem[] = [];
      collectOptions(children, out);
      return out;
    }, [children]);

    const isControlled = value !== undefined;
    const [internalValue, setInternalValue] = useState<string>(
      defaultValue != null ? String(defaultValue) : "",
    );
    const currentValue = isControlled ? String(value ?? "") : internalValue;

    const [open, setOpen] = useState(false);
    const [highlight, setHighlight] = useState(0);
    const rootRef = useRef<HTMLDivElement | null>(null);
    const listRef = useRef<HTMLUListElement | null>(null);

    // Expose root ref
    useEffect(() => {
      if (typeof ref === "function") ref(rootRef.current);
      else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = rootRef.current;
    }, [ref]);

    const selected = options.find((o) => o.value === currentValue);
    const displayLabel = selected
      ? selected.label
      : placeholder ?? (
          <span className="text-slate-400">
            {options[0]?.text || "Select..."}
          </span>
        );

    const commit = useCallback(
      (v: string) => {
        if (!isControlled) setInternalValue(v);
        onChange?.({ target: { value: v, name } });
      },
      [isControlled, onChange, name],
    );

    // Close on outside click
    useEffect(() => {
      if (!open) return;
      const handler = (e: MouseEvent) => {
        if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
          setOpen(false);
        }
      };
      document.addEventListener("mousedown", handler);
      return () => document.removeEventListener("mousedown", handler);
    }, [open]);

    // Scroll highlight into view
    useEffect(() => {
      if (!open || !listRef.current) return;
      const el = listRef.current.querySelectorAll<HTMLLIElement>("[data-option]")[
        highlight
      ];
      el?.scrollIntoView({ block: "nearest" });
    }, [open, highlight]);

    // Sync highlight when opening
    useEffect(() => {
      if (open) {
        const idx = options.findIndex((o) => o.value === currentValue);
        setHighlight(idx >= 0 ? idx : 0);
      }
    }, [open, currentValue, options]);

    const handleKey = (e: React.KeyboardEvent<HTMLButtonElement>) => {
      if (disabled) return;
      if (!open) {
        if (
          e.key === "Enter" ||
          e.key === " " ||
          e.key === "ArrowDown" ||
          e.key === "ArrowUp"
        ) {
          e.preventDefault();
          setOpen(true);
        }
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlight((h) => {
          for (let i = 1; i <= options.length; i++) {
            const next = (h + i) % options.length;
            if (!options[next].disabled) return next;
          }
          return h;
        });
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlight((h) => {
          for (let i = 1; i <= options.length; i++) {
            const next = (h - i + options.length) % options.length;
            if (!options[next].disabled) return next;
          }
          return h;
        });
      } else if (e.key === "Enter") {
        e.preventDefault();
        const opt = options[highlight];
        if (opt && !opt.disabled) {
          commit(opt.value);
          setOpen(false);
        }
      } else if (e.key === "Home") {
        e.preventDefault();
        setHighlight(0);
      } else if (e.key === "End") {
        e.preventDefault();
        setHighlight(options.length - 1);
      }
    };

    return (
      <div className="space-y-1.5">
        {label && (
          <label
            htmlFor={selectId}
            className="block text-sm font-medium text-slate-700"
          >
            {label}
            {required && <span className="ml-0.5 text-rose-500">*</span>}
          </label>
        )}
        <div ref={rootRef} className="relative" {...rest}>
          <button
            type="button"
            id={selectId}
            role="combobox"
            aria-haspopup="listbox"
            aria-expanded={open}
            aria-disabled={disabled}
            disabled={disabled}
            onClick={() => !disabled && setOpen((o) => !o)}
            onKeyDown={handleKey}
            className={clsx(
              "w-full flex items-center justify-between gap-2 rounded-xl border bg-white px-3.5 py-2.5 text-left text-sm text-slate-900 shadow-sm transition-all",
              "focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20",
              "disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400",
              error
                ? "border-rose-300 focus:border-rose-500 focus:ring-rose-500/20"
                : "border-slate-200",
              className,
            )}
          >
            <span className="flex-1 truncate">
              {selected ? (
                selected.label
              ) : placeholder ? (
                <span className="text-slate-400">{placeholder}</span>
              ) : (
                displayLabel
              )}
            </span>
            <svg
              className={clsx(
                "h-4 w-4 shrink-0 text-slate-400 transition-transform",
                open && "rotate-180",
              )}
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M5.23 7.21a.75.75 0 011.06.02L10 11.06l3.71-3.83a.75.75 0 111.08 1.04l-4.25 4.39a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z"
                clipRule="evenodd"
              />
            </svg>
          </button>
          {open && (
            <ul
              ref={listRef}
              role="listbox"
              tabIndex={-1}
              className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-xl border border-slate-200 bg-white py-1 text-sm shadow-lg ring-1 ring-slate-900/5 focus:outline-none"
            >
              {options.length === 0 && (
                <li className="px-3 py-2 text-slate-400">No options</li>
              )}
              {options.map((opt, idx) => {
                const isSelected = opt.value === currentValue;
                const isActive = idx === highlight;
                return (
                  <li
                    key={`${opt.value}-${idx}`}
                    data-option
                    role="option"
                    aria-selected={isSelected}
                    aria-disabled={opt.disabled}
                    onMouseEnter={() => setHighlight(idx)}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      if (opt.disabled) return;
                      commit(opt.value);
                      setOpen(false);
                    }}
                    className={clsx(
                      "flex cursor-pointer items-center justify-between gap-2 px-3 py-2",
                      opt.disabled && "cursor-not-allowed text-slate-300",
                      !opt.disabled && isActive && "bg-blue-50 text-blue-900",
                      !opt.disabled && !isActive && "text-slate-700",
                      isSelected && !opt.disabled && "font-medium",
                    )}
                  >
                    <span className="flex-1 truncate">{opt.label}</span>
                    {isSelected && (
                      <svg
                        className="h-4 w-4 text-blue-600"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        aria-hidden="true"
                      >
                        <path
                          fillRule="evenodd"
                          d="M16.7 5.3a1 1 0 010 1.4l-8 8a1 1 0 01-1.4 0l-4-4a1 1 0 111.4-1.4L8 12.58l7.3-7.3a1 1 0 011.4 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {name && (
            <input
              type="hidden"
              name={name}
              value={currentValue}
              aria-hidden="true"
            />
          )}
        </div>
        {error && <p className="text-xs font-medium text-rose-600">{error}</p>}
      </div>
    );
  },
);
Select.displayName = "Select";
