"use client";

import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "danger";
type Size = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

const variantClasses: Record<Variant, string> = {
  primary:
    "bg-zinc-900 text-white hover:bg-zinc-700 active:bg-zinc-800 disabled:bg-zinc-400 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-300 dark:disabled:bg-zinc-600",
  secondary:
    "border border-zinc-300 text-zinc-800 hover:bg-zinc-100 active:bg-zinc-200 disabled:text-zinc-400 disabled:hover:bg-transparent dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800 dark:disabled:text-zinc-600",
  danger:
    "border border-red-300 text-red-700 hover:bg-red-50 active:bg-red-100 disabled:text-red-300 disabled:hover:bg-transparent dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950 dark:disabled:text-red-900",
};

const sizeClasses: Record<Size, string> = {
  sm: "px-3 py-1.5 text-sm rounded-lg",
  md: "px-4 py-2 text-sm rounded-lg",
  lg: "px-5 py-2.5 text-base rounded-xl",
};

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  disabled,
  className = "",
  children,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 disabled:cursor-not-allowed ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
      {...props}
    >
      {loading && (
        <svg
          className="h-4 w-4 animate-spin"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
          />
        </svg>
      )}
      {children}
    </button>
  );
}