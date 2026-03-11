import { useState, useCallback, useEffect, useRef } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ToastMessage {
  id: string;
  type: "success" | "error" | "info";
  message: string;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

const MAX_VISIBLE = 3;
const AUTO_DISMISS_MS = 4_000;

let toastCounter = 0;

export function useToast() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const addToast = useCallback(
    (type: ToastMessage["type"], message: string) => {
      const id = `toast-${++toastCounter}-${Date.now()}`;
      setToasts((prev) => {
        const next = [...prev, { id, type, message }];
        // Evict oldest when exceeding max visible
        while (next.length > MAX_VISIBLE) {
          const evicted = next.shift()!;
          const timer = timersRef.current.get(evicted.id);
          if (timer) {
            clearTimeout(timer);
            timersRef.current.delete(evicted.id);
          }
        }
        return next;
      });

      const timer = setTimeout(() => removeToast(id), AUTO_DISMISS_MS);
      timersRef.current.set(id, timer);
    },
    [removeToast],
  );

  // Cleanup all timers on unmount
  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((t) => clearTimeout(t));
      timers.clear();
    };
  }, []);

  return { toasts, addToast, removeToast };
}

// ---------------------------------------------------------------------------
// Container
// ---------------------------------------------------------------------------

const borderColors: Record<ToastMessage["type"], string> = {
  success:
    "border-l-green-500 dark:border-l-green-400",
  error:
    "border-l-red-500 dark:border-l-red-400",
  info:
    "border-l-blue-500 dark:border-l-blue-400",
};

const iconColors: Record<ToastMessage["type"], string> = {
  success: "text-green-600 dark:text-green-400",
  error: "text-red-600 dark:text-red-400",
  info: "text-blue-600 dark:text-blue-400",
};

interface ToastContainerProps {
  toasts: ToastMessage[];
  removeToast: (id: string) => void;
}

export function ToastContainer({ toasts, removeToast }: ToastContainerProps) {
  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      aria-label="Notifications"
      className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="status"
          className={cn(
            "flex items-start gap-3 rounded-md border border-l-4 bg-card p-3 shadow-lg animate-in slide-in-from-right-full fade-in duration-200",
            borderColors[toast.type],
          )}
        >
          <span className={cn("mt-0.5 text-sm font-medium", iconColors[toast.type])}>
            {toast.type === "success" ? "✓" : toast.type === "error" ? "✗" : "ℹ"}
          </span>
          <p className="flex-1 text-sm text-card-foreground">{toast.message}</p>
          <button
            type="button"
            onClick={() => removeToast(toast.id)}
            className="shrink-0 rounded-sm p-0.5 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Dismiss notification"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
