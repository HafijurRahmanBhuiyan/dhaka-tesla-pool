"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import { ApiError } from "@/lib/apiClient";
import type { AuthResponse, ErrorBody, Role } from "@/lib/types";
import { useAuth } from "@/context/AuthContext";

const KNOWN_FIELDS = new Set([
  "name",
  "phone",
  "email",
  "password",
  "role",
  "tesla.plateNickname",
  "tesla.seatCapacity",
]);

function parseErrors(data: ErrorBody): { fieldErrors: Record<string, string>; other: string[] } {
  const fieldErrors: Record<string, string> = {};
  const other: string[] = [];
  for (const issue of data.issues ?? []) {
    if (KNOWN_FIELDS.has(issue.field)) {
      if (!fieldErrors[issue.field]) fieldErrors[issue.field] = issue.message;
    } else {
      other.push(issue.message);
    }
  }
  return { fieldErrors, other };
}

interface RegisterForm {
  name: string;
  phone: string;
  email: string;
  password: string;
  role: Role;
  plateNickname: string;
  seatCapacity: string;
}

const INITIAL: RegisterForm = {
  name: "",
  phone: "",
  email: "",
  password: "",
  role: "PASSENGER",
  plateNickname: "",
  seatCapacity: "4",
};

function InputField({
  id, label, type = "text", value, onChange, placeholder, hint, error, required, autoComplete,
}: {
  id: string; label: string; type?: string; value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string; hint?: string; error?: string; required?: boolean; autoComplete?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-[var(--foreground)]">
        {label}
      </label>
      <input
        id={id} type={type} value={value} onChange={onChange}
        placeholder={placeholder} required={required} autoComplete={autoComplete}
        className={`w-full rounded-xl border bg-[var(--muted)] px-4 py-2.5 text-sm text-[var(--foreground)] placeholder-[var(--muted-foreground)] transition-colors focus:outline-none focus:ring-2 ${
          error
            ? "border-red-400 focus:border-red-400 focus:ring-red-400/20"
            : "border-[var(--card-border)] focus:border-amber-400 focus:ring-amber-400/20"
        }`}
      />
      {hint && !error && <p className="mt-1 text-xs text-[var(--muted-foreground)]">{hint}</p>}
      {error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}

export default function RegisterPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [form, setForm] = useState<RegisterForm>(INITIAL);
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [otherIssues, setOtherIssues] = useState<string[]>([]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const isDriver = form.role === "DRIVER";

  function set<K extends keyof RegisterForm>(key: K, value: RegisterForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setGeneralError(null);
    setOtherIssues([]);
    setFieldErrors({});
    setLoading(true);
    try {
      const payload = {
        name: form.name,
        phone: form.phone,
        email: form.email,
        password: form.password,
        role: form.role,
        tesla: isDriver
          ? { plateNickname: form.plateNickname, seatCapacity: Number(form.seatCapacity) }
          : undefined,
      };
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as AuthResponse | ErrorBody;
      if (!res.ok) {
        const err = data as ErrorBody;
        const parsed = parseErrors(err);
        setFieldErrors(parsed.fieldErrors);
        setOtherIssues(parsed.other);
        if (parsed.other.length === 0 && Object.keys(parsed.fieldErrors).length === 0) {
          setGeneralError(err.error ?? "Unable to create your account.");
        }
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

  const allErrors = [
    generalError,
    ...otherIssues,
  ].filter(Boolean) as string[];

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
            Create your account
          </h1>
          <p className="mt-1.5 text-sm text-[var(--muted-foreground)]">
            Join as a passenger or a Tesla-owning driver
          </p>
        </div>

        <div className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-6 shadow-sm">
          {allErrors.length > 0 && (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 dark:border-red-900/50 dark:bg-red-950/50">
              {allErrors.map((err, i) => (
                <p key={i} className="text-sm font-medium text-red-700 dark:text-red-300">
                  {err}
                </p>
              ))}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <InputField
              id="name" label="Full name" value={form.name}
              onChange={(e) => set("name", e.target.value)}
              autoComplete="name" error={fieldErrors.name} required
            />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <InputField
                id="phone" label="Phone" type="tel" value={form.phone}
                onChange={(e) => set("phone", e.target.value)}
                autoComplete="tel" placeholder="01xxxxxxxxx"
                error={fieldErrors.phone} required
              />
              <InputField
                id="email" label="Email" type="email" value={form.email}
                onChange={(e) => set("email", e.target.value)}
                autoComplete="email" placeholder="you@example.com"
                error={fieldErrors.email} required
              />
            </div>
            <InputField
              id="password" label="Password" type="password" value={form.password}
              onChange={(e) => set("password", e.target.value)}
              autoComplete="new-password" hint="At least 8 characters."
              error={fieldErrors.password} required
            />

            {/* Role selection */}
            <fieldset>
              <legend className="mb-2 block text-sm font-medium text-[var(--foreground)]">
                I want to join as
              </legend>
              <div className="grid grid-cols-2 gap-2">
                {(["PASSENGER", "DRIVER"] as Role[]).map((role) => (
                  <label
                    key={role}
                    className={`flex cursor-pointer items-center justify-center gap-2 rounded-xl border px-3 py-3 text-sm font-medium transition-all ${
                      form.role === role
                        ? "border-amber-500 bg-amber-500 text-white shadow-sm"
                        : "border-[var(--card-border)] text-[var(--muted-foreground)] hover:border-amber-300 hover:text-[var(--foreground)]"
                    }`}
                  >
                    <input
                      type="radio" name="role" value={role}
                      checked={form.role === role}
                      onChange={() => set("role", role)}
                      className="sr-only"
                    />
                    {role === "PASSENGER" ? (
                      <>
                        <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                          <path d="M10 9a3 3 0 100-6 3 3 0 000 6zM6 8a2 2 0 11-4 0 2 2 0 014 0zM1.49 15.326a.78.78 0 01-.358-.442 3 3 0 014.308-3.516 6.484 6.484 0 00-1.905 3.959c-.023.222-.014.442.025.654a4.97 4.97 0 01-2.07-.655zM16.44 15.98a4.97 4.97 0 002.07-.654.78.78 0 00.357-.442 3 3 0 00-4.308-3.517 6.484 6.484 0 011.907 3.96 2.32 2.32 0 01-.026.654zM18 8a2 2 0 11-4 0 2 2 0 014 0zM5.304 16.19a.844.844 0 01-.277-.71 5 5 0 019.947 0 .843.843 0 01-.277.71A6.975 6.975 0 0110 18a6.974 6.974 0 01-4.696-1.81z" />
                        </svg>
                        Passenger
                      </>
                    ) : (
                      <>
                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M13 2L4.09 12.97 11.5 12l-1.5 9 8.91-10.97H11.5L13 2z" />
                        </svg>
                        Driver
                      </>
                    )}
                  </label>
                ))}
              </div>
            </fieldset>

            {/* Driver Tesla details */}
            {isDriver && (
              <div className="rounded-xl border border-amber-200/60 bg-amber-50/50 p-4 dark:border-amber-900/30 dark:bg-amber-950/20">
                <p className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M13 2L4.09 12.97 11.5 12l-1.5 9 8.91-10.97H11.5L13 2z" />
                  </svg>
                  Your Tesla
                </p>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <InputField
                    id="plateNickname" label="Tesla nickname" value={form.plateNickname}
                    onChange={(e) => set("plateNickname", e.target.value)}
                    placeholder="e.g. Bullet" hint="Shown to passengers when matched."
                    error={fieldErrors["tesla.plateNickname"]} required
                  />
                  <div>
                    <label htmlFor="seatCapacity" className="mb-1.5 block text-sm font-medium text-[var(--foreground)]">
                      Seat capacity
                    </label>
                    <select
                      id="seatCapacity"
                      value={form.seatCapacity}
                      onChange={(e) => set("seatCapacity", e.target.value)}
                      className="w-full rounded-xl border border-[var(--card-border)] bg-[var(--muted)] px-4 py-2.5 text-sm text-[var(--foreground)] focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-400/20"
                    >
                      {[2, 3, 4, 5].map((n) => (
                        <option key={n} value={n}>{n} seats</option>
                      ))}
                    </select>
                    {fieldErrors["tesla.seatCapacity"] && (
                      <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                        {fieldErrors["tesla.seatCapacity"]}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              id="create-account-btn"
              className="mt-2 w-full inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 px-5 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-400/50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? (
                <>
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                  </svg>
                  Creating account…
                </>
              ) : (
                "Create account"
              )}
            </button>
          </form>
        </div>

        <p className="mt-5 text-center text-sm text-[var(--muted-foreground)]">
          Already have an account?{" "}
          <Link
            href="/login"
            className="font-semibold text-amber-600 hover:text-amber-500 dark:text-amber-400 dark:hover:text-amber-300"
          >
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}