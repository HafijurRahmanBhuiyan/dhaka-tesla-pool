"use client";

import type { SelectHTMLAttributes } from "react";

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  id: string;
  error?: string;
}

export function Select({ label, id, error, className = "", children, ...props }: SelectProps) {
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
        {label}
      </label>
      <select
        id={id}
        className={`w-full rounded-lg border bg-white px-3 py-2 text-sm text-zinc-900 focus:outline-none focus:ring-2 dark:bg-zinc-900 dark:text-zinc-100 ${
          error
            ? "border-red-400 focus:ring-red-300 dark:border-red-700"
            : "border-zinc-300 focus:ring-zinc-400 dark:border-zinc-700"
        }`}
        {...props}
      >
        {children}
      </select>
      {error ? <p className="mt-1.5 text-sm text-red-600 dark:text-red-400">{error}</p> : null}
    </div>
  );
}