"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/context/AuthContext";

export function HeaderActions() {
  const router = useRouter();
  const { authenticated, role, user, loading, logout } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await logout();
      router.push("/login");
      router.refresh();
    } catch {
      router.push("/login");
    } finally {
      setLoggingOut(false);
    }
  }

  if (loading) {
    return <div className="h-9 w-28 animate-pulse rounded-lg bg-[var(--muted)]" />;
  }

  return (
    <div className="flex items-center gap-3">
      {authenticated && role === "PASSENGER" && (
        <div className="hidden items-center gap-1 sm:flex">
          <Link
            href="/rides"
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
          >
            My Rides
          </Link>
          <Link
            href="/rides/new"
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
          >
            Book a Ride
          </Link>
        </div>
      )}

      {authenticated && role === "DRIVER" && (
        <div className="hidden items-center sm:flex">
          <Link
            href="/driver/dashboard"
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
          >
            Driver Dashboard
          </Link>
        </div>
      )}

      {!authenticated ? (
        <div className="flex items-center gap-2">
          <Link
            href="/login"
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
          >
            Sign in
          </Link>
          <Link
            href="/register"
            className="inline-flex items-center rounded-lg bg-amber-500 px-3.5 py-1.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-amber-400"
          >
            Get started
          </Link>
        </div>
      ) : (
        <div className="flex items-center gap-2.5">
          {role === "DRIVER" ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
              Driver Mode
            </span>
          ) : (
            user?.name && (
              <span className="hidden text-xs font-medium text-[var(--muted-foreground)] sm:inline-block">
                {user.name}
              </span>
            )
          )}
          <button
            id="sign-out-btn"
            type="button"
            onClick={() => void handleLogout()}
            disabled={loggingOut}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--card-border)] bg-[var(--card)] px-3 py-1.5 text-xs font-medium text-[var(--muted-foreground)] transition-colors hover:border-[var(--muted-foreground)] hover:text-[var(--foreground)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loggingOut ? (
              <>
                <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
                Signing out…
              </>
            ) : (
              <>
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-3.5 w-3.5" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                Sign out
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}