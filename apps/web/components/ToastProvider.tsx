"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

type Variant = "success" | "error";

type ToastState = {
  message: string;
  variant: Variant;
  leaving: boolean;
};

type ToastContextValue = {
  show: (message: string, variant?: Variant) => void;
};

const ToastContext = createContext<ToastContextValue>({
  show: () => {},
});

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  const show = useCallback((message: string, variant: Variant = "success") => {
    clearTimeout(timerRef.current);
    setToast({ message, variant, leaving: false });

    timerRef.current = setTimeout(() => {
      setToast((prev) => (prev ? { ...prev, leaving: true } : null));
      setTimeout(() => setToast(null), 400);
    }, 3500);
  }, []);

  const value = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast && (
        <div
          className={`toast toast--${toast.variant}${toast.leaving ? " toast--leaving" : ""}`}
          role="status"
          aria-live="polite"
        >
          {toast.message}
        </div>
      )}
    </ToastContext.Provider>
  );
}
