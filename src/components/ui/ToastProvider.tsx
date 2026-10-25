"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

export type ToastVariant = "success" | "error" | "warning" | "info";

export type ToastAction = {
  label: string;
  href?: string;
  onClick?: () => void;
};

export type ToastOptions = {
  variant?: ToastVariant;
  durationMs?: number;
  action?: ToastAction;
};

type ToastItem = {
  id: string;
  message: string;
  variant: ToastVariant;
  durationMs: number;
  action?: ToastAction;
};

type ToastApi = {
  show(message: string, options?: ToastOptions): string;
  success(message: string, options?: Omit<ToastOptions, "variant">): string;
  error(message: string, options?: Omit<ToastOptions, "variant">): string;
  warning(message: string, options?: Omit<ToastOptions, "variant">): string;
  info(message: string, options?: Omit<ToastOptions, "variant">): string;
  dismiss(id: string): void;
};

const ToastContext = createContext<ToastApi | null>(null);
const durations: Record<ToastVariant, number> = {
  success: 4500,
  info: 5000,
  warning: 10000,
  error: 9000,
};

let toastSequence = 0;

function nextToastId(): string {
  toastSequence += 1;
  return `toast-${Date.now()}-${toastSequence}`;
}

/** Provider global des retours utilisateur (succès, erreur, warning, info). */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: string): void => {
    const timer = timers.current.get(id);
    if (timer !== undefined) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts((previous) => previous.filter((toast) => toast.id !== id));
  }, []);

  const show = useCallback(
    (message: string, options: ToastOptions = {}): string => {
      const variant = options.variant ?? "info";
      const id = nextToastId();
      const durationMs = options.durationMs ?? durations[variant];
      setToasts((previous) => [
        ...previous.slice(-4),
        {
          id,
          message,
          variant,
          durationMs,
          ...(options.action === undefined ? {} : { action: options.action }),
        },
      ]);
      if (durationMs > 0) {
        const timer = setTimeout(() => dismiss(id), durationMs);
        timers.current.set(id, timer);
      }
      return id;
    },
    [dismiss],
  );

  useEffect(() => {
    const current = timers.current;
    return () => {
      for (const timer of current.values()) clearTimeout(timer);
      current.clear();
    };
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      show,
      success: (message, options) => show(message, { ...options, variant: "success" }),
      error: (message, options) => show(message, { ...options, variant: "error" }),
      warning: (message, options) => show(message, { ...options, variant: "warning" }),
      info: (message, options) => show(message, { ...options, variant: "info" }),
      dismiss,
    }),
    [dismiss, show],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toast-viewport" aria-live="polite" aria-relevant="additions">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`toast ${toast.variant}`}
            role={toast.variant === "error" || toast.variant === "warning" ? "alert" : "status"}
          >
            <div className="toast-body">
              <p className="toast-message">{toast.message}</p>
              {toast.action !== undefined ? (
                toast.action.href !== undefined ? (
                  <a className="toast-action" href={toast.action.href}>
                    {toast.action.label}
                  </a>
                ) : (
                  <button
                    type="button"
                    className="toast-action"
                    onClick={() => {
                      toast.action?.onClick?.();
                      dismiss(toast.id);
                    }}
                  >
                    {toast.action.label}
                  </button>
                )
              ) : null}
            </div>
            <button
              type="button"
              className="toast-close"
              aria-label="Fermer la notification"
              onClick={() => dismiss(toast.id)}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const context = useContext(ToastContext);
  if (context === null) {
    throw new Error("useToast doit être utilisé dans ToastProvider");
  }
  return context;
}

/** Affiche automatiquement un message local (error/notice) en toast. */
export function useToastOnMessage(
  error: string | null | undefined,
  notice?: string | null | undefined,
): void {
  const toast = useToast();
  useEffect(() => {
    if (error !== null && error !== undefined && error !== "") toast.error(error);
  }, [error, toast]);
  useEffect(() => {
    if (notice !== null && notice !== undefined && notice !== "") toast.success(notice);
  }, [notice, toast]);
}
