import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Button } from "../components/ui/button";
import { useScopedTranslation } from "./I18nContext";

interface ConfirmDialogOptions {
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
}

interface ConfirmDialogRequest extends ConfirmDialogOptions {
  resolve: (value: boolean) => void;
}

interface ConfirmDialogContextValue {
  confirm: (options: ConfirmDialogOptions) => Promise<boolean>;
}

const ConfirmDialogContext = createContext<ConfirmDialogContextValue | null>(
  null,
);

export function ConfirmDialogProvider({ children }: { children: ReactNode }) {
  const tc = useScopedTranslation("components", "common");
  const [request, setRequest] = useState<ConfirmDialogRequest | null>(null);

  const close = useCallback((accepted: boolean) => {
    setRequest((current) => {
      if (current) {
        current.resolve(accepted);
      }
      return null;
    });
  }, []);

  const confirm = useCallback((options: ConfirmDialogOptions) => {
    return new Promise<boolean>((resolve) => {
      setRequest({
        ...options,
        resolve,
      });
    });
  }, []);

  const value = useMemo(() => ({ confirm }), [confirm]);

  return (
    <ConfirmDialogContext.Provider value={value}>
      {children}

      {request && (
        <div
          className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4"
          onClick={() => close(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-900">{request.title}</h3>
              {request.description && (
                <p className="mt-2 text-sm text-slate-600">{request.description}</p>
              )}
            </div>
            <div className="p-6 bg-slate-50 flex items-center justify-end gap-2 rounded-b-2xl">
              <Button variant="outline" onClick={() => close(false)}>
                {request.cancelText || tc("cancel", "Cancel")}
              </Button>
              <Button
                variant={request.destructive ? "destructive" : "default"}
                onClick={() => close(true)}
              >
                {request.confirmText || tc("confirm", "Confirm")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </ConfirmDialogContext.Provider>
  );
}

export function useConfirmDialog(): ConfirmDialogContextValue {
  const context = useContext(ConfirmDialogContext);
  if (!context) {
    throw new Error("useConfirmDialog must be used within ConfirmDialogProvider");
  }
  return context;
}
