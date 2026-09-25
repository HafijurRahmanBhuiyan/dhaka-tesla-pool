"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ApiError } from "@/lib/apiClient";
import type { AuthResponse, ErrorBody } from "@/lib/types";
import { useAuth } from "@/context/AuthContext";

function issuesFor(data: ErrorBody): Record<string, string> {
  const map: Record<string, string> = {};
  for (const issue of data.issues ?? []) {
    if (!map[issue.field]) map[issue.field] = issue.message;
  }
  return map;
}

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setGeneralError(null);
    setFieldErrors({});
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ identifier, password }),
      });
      const data = (await res.json()) as AuthResponse | ErrorBody;
      if (!res.ok) {
        const err = data as ErrorBody;
        setFieldErrors(issuesFor(err));
        setGeneralError(err.error ?? "Unable to sign in. Please try again.");
        return;
      }
      const auth = data as AuthResponse;
      login(auth);
      router.push(auth.user.role === "DRIVER" ? "/driver/dashboard" : "/rides");
      router.refresh();
    } catch (error) {
      if (error instanceof ApiError) setGeneralError(error.message);
      else setGeneralError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-[calc(100vh-8rem)] flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        {/* Brand header */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500 shadow-lg">
            <svg viewBox="0 0 24 24" fill="currentColor" className="h-8 w-8 text-white" aria-hidden="true">
              <path d="M13 2L4.09 12.97 11.5 12l-1.5 9 8.91-10.97H11.5L13 2z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--foreground)]">
            Welcome back
          </h1>
          <p className="mt-1.5 text-sm text-[var(--muted-foreground)]">
            Sign in to your Dhaka Tesla Pool account
          </p>
        </div>

        <div className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-6 shadow-sm">
          {generalError && (
            <div className="mb-4 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 dark:border-red-900/50 dark:bg-red-950/50">
              <svg className="mt-0.5 h-4 w-4 shrink-0 text-red-500" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
              </svg>
              <p className="text-sm font-medium text-red-700 dark:text-red-300">{generalError}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div>
              <label
                htmlFor="identifier"
                className="mb-1.5 block text-sm font-medium text-[var(--foreground)]"
              >
                Email or phone
              </label>
              <input
                id="identifier"
                type="text"
                autoComplete="username"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="you@example.com or 01xxxxxxxxx"
                required
                className="w-full rounded-xl border border-[var(--card-border)] bg-[var(--muted)] px-4 py-2.5 text-sm text-[var(--foreground)] placeholder-[var(--muted-foreground)] transition-colors focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-400/20"
              />
              {fieldErrors.identifier && (
                <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">{fieldErrors.identifier}</p>
              )}
            </div>

            <div>
              <label
                htmlFor="password"
                className="mb-1.5 block text-sm font-medium text-[var(--foreground)]"
              >
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full rounded-xl border border-[var(--card-border)] bg-[var(--muted)] px-4 py-2.5 pr-10 text-sm text-[var(--foreground)] placeholder-[var(--muted-foreground)] transition-colors focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-400/20"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                    </svg>
                  ) : (
                    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  )}
                </button>
              </div>
              {fieldErrors.password && (
                <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">{fieldErrors.password}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={loading || !identifier || !password}
              id="sign-in-btn"
              className="mt-2 w-full inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 px-5 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-400/50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? (
                <>
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                  </svg>
                  Signing in…
                </>
              ) : (
                "Sign in"
              )}
            </button>
          </form>
        </div>

        <p className="mt-5 text-center text-sm text-[var(--muted-foreground)]">
          New to Dhaka Tesla Pool?{" "}
          <Link
            href="/register"
            className="font-semibold text-amber-600 hover:text-amber-500 dark:text-amber-400 dark:hover:text-amber-300"
          >
            Create an account
          </Link>
        </p>
      </div>
    </main>
  );
}