"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ApiError } from "@/lib/apiClient";
import type { AuthResponse, ErrorBody } from "@/lib/types";
import { Button } from "@/components/Button";
import { TextField } from "@/components/TextField";
import { FieldErrors } from "@/components/FieldErrors";

function issuesFor(data: ErrorBody): Record<string, string> {
  const map: Record<string, string> = {};
  for (const issue of data.issues ?? []) {
    if (!map[issue.field]) map[issue.field] = issue.message;
  }
  return map;
}

export default function LoginPage() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

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
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-12">
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
          Welcome back
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Sign in to book or offer a pool ride.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
          <FieldErrors error={generalError} className="mb-4" />

          <TextField
            id="identifier"
            label="Email or phone"
            type="text"
            autoComplete="username"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            placeholder="you@example.com or 01xxxxxxxxx"
            error={fieldErrors.identifier}
            required
          />
          <TextField
            id="password"
            label="Password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={fieldErrors.password}
            required
          />

          <Button type="submit" size="lg" loading={loading} className="w-full">
            Sign in
          </Button>
        </form>

        <p className="mt-5 text-center text-sm text-zinc-500 dark:text-zinc-400">
          New to Dhaka Tesla Pool?{" "}
          <Link
            href="/register"
            className="font-medium text-zinc-900 underline-offset-4 hover:underline dark:text-zinc-100"
          >
            Create an account
          </Link>
        </p>
      </div>
    </main>
  );
}