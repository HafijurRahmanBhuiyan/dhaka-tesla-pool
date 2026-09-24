"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import { ApiError } from "@/lib/apiClient";
import type { AuthResponse, ErrorBody, Role } from "@/lib/types";
import { Button } from "@/components/Button";
import { TextField } from "@/components/TextField";
import { Select } from "@/components/Select";
import { FieldErrors } from "@/components/FieldErrors";

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

export default function RegisterPage() {
  const router = useRouter();
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
          Create an account
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Join as a passenger or a Tesla-owning driver.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
          <FieldErrors error={generalError} issues={otherIssues} />

          <TextField
            id="name"
            label="Full name"
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            autoComplete="name"
            error={fieldErrors.name}
            required
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <TextField
              id="phone"
              label="Phone"
              type="tel"
              value={form.phone}
              onChange={(e) => set("phone", e.target.value)}
              autoComplete="tel"
              placeholder="01xxxxxxxxx"
              error={fieldErrors.phone}
              required
            />
            <TextField
              id="email"
              label="Email"
              type="email"
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
              autoComplete="email"
              placeholder="you@example.com"
              error={fieldErrors.email}
              required
            />
          </div>
          <TextField
            id="password"
            label="Password"
            type="password"
            value={form.password}
            onChange={(e) => set("password", e.target.value)}
            autoComplete="new-password"
            hint="At least 8 characters."
            error={fieldErrors.password}
            required
          />

          <fieldset>
            <legend className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              I want to join as
            </legend>
            <div className="grid grid-cols-2 gap-2">
              {(["PASSENGER", "DRIVER"] as Role[]).map((role) => (
                <label
                  key={role}
                  className={`flex cursor-pointer items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                    form.role === role
                      ? "border-zinc-900 bg-zinc-900 text-white dark:border-white dark:bg-white dark:text-zinc-900"
                      : "border-zinc-300 text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  }`}
                >
                  <input
                    type="radio"
                    name="role"
                    value={role}
                    checked={form.role === role}
                    onChange={() => set("role", role)}
                    className="sr-only"
                  />
                  {role === "PASSENGER" ? "Passenger" : "Driver"}
                </label>
              ))}
            </div>
            {fieldErrors.role && (
              <p className="mt-1.5 text-sm text-red-600 dark:text-red-400">{fieldErrors.role}</p>
            )}
          </fieldset>

          {isDriver && (
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-950">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <TextField
                  id="plateNickname"
                  label="Tesla nickname"
                  value={form.plateNickname}
                  onChange={(e) => set("plateNickname", e.target.value)}
                  placeholder="e.g. Bullet"
                  hint="Shown to passengers when matched."
                  error={fieldErrors["tesla.plateNickname"]}
                  required
                />
                <Select
                  id="seatCapacity"
                  label="Seat capacity"
                  value={form.seatCapacity}
                  onChange={(e) => set("seatCapacity", e.target.value)}
                  error={fieldErrors["tesla.seatCapacity"]}
                >
                  {[2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>
                      {n} seats
                    </option>
                  ))}
                </Select>
              </div>
            </div>
          )}

          <Button type="submit" size="lg" loading={loading} className="w-full">
            Create account
          </Button>
        </form>

        <p className="mt-5 text-center text-sm text-zinc-500 dark:text-zinc-400">
          Already have an account?{" "}
          <Link
            href="/login"
            className="font-medium text-zinc-900 underline-offset-4 hover:underline dark:text-zinc-100"
          >
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}