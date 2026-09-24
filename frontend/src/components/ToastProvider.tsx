"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { setUnauthorizedHandler, toastBus } from "@/lib/apiClient";

interface Toast {
  id: number;
  message: string;
  variant: "error" | "info" | "success";
}

let nextId = 1;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const router = useRouter();

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    setUnauthorizedHandler(() => router.push("/login"));
    toastBus.setListener((message, variant) => {
      const id = nextId++;
      setToasts((prev) => [...prev, { id, message, variant }]);
      timers.push(
        setTimeout(() => {
          setToasts((prev) => prev.filter((t) => t.id !== id));
        }, 4500),
      );
    });
    return () => {
      setUnauthorizedHandler(null);
      toastBus.setListener(null);
      timers.forEach(clearTimeout);
    };
  }, [router]);

  return (
    <>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 top-4 z-50 flex flex-col items-center gap-2 px-4"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto w-full max-w-sm rounded-xl border px-4 py-3 text-sm font-medium shadow-lg ${
              toast.variant === "error"
                ? "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
                : toast.variant === "success"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300"
                  : "border-zinc-200 bg-white text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
            }`}
          >
            {toast.message}
          </div>
        ))}
      </div>
    </>
  );
}