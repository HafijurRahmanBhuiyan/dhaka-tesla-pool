"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { Role } from "@/lib/types";
import { Button } from "./Button";

interface AuthMeResponse {
  authenticated: boolean;
  role: Role | null;
}

export function HeaderActions() {
  const router = useRouter();
  const [auth, setAuth] = useState<AuthMeResponse>({ authenticated: false, role: null });
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me", { cache: "no-store" })
      .then((res) => res.json())
      .then((data: AuthMeResponse) => {
        if (!cancelled) setAuth(data);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      router.push("/login");
      router.refresh();
    }
  }

  return (
    <div className="flex items-center gap-3">
      {auth.authenticated && auth.role === "DRIVER" && (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-400 px-3 py-1 text-xs font-semibold text-zinc-900 dark:bg-amber-400 dark:text-zinc-900">
          <svg
            className="h-3.5 w-3.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19 9l-7-3.5L5 9m14 0v6m-14-6v6m0 0H4a1 1 0 01-1-1v-3a1 1 0 011-1h5m-4 5v3m0 0h4m-4-3h4m10 0h-4m4 3v3m0 0h-4m4-3h-4"
            />
          </svg>
          Driver Mode
        </span>
      )}
      {auth.authenticated && (
        <Button variant="secondary" size="sm" onClick={handleLogout} loading={loggingOut}>
          Sign out
        </Button>
      )}
    </div>
  );
}