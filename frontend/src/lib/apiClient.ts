import type { ErrorBody, ZodIssue } from "./types";

export class ApiError extends Error {
  status: number;
  issues?: ZodIssue[];

  constructor(status: number, message: string, issues?: ZodIssue[]) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.issues = issues;
  }
}

type ToastVariant = "error" | "info" | "success";

type ToastListener = (message: string, variant: ToastVariant) => void;

let toastListener: ToastListener | null = null;

export const toastBus = {
  setListener: (listener: ToastListener | null) => {
    toastListener = listener;
  },
  emit: (message: string, variant: ToastVariant = "error") => {
    toastListener?.(message, variant);
  },
};

let unauthorizedHandler: (() => void) | null = null;

export const setUnauthorizedHandler = (handler: (() => void) | null) => {
  unauthorizedHandler = handler;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: {
      accept: "application/json",
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...init?.headers,
    },
    cache: "no-store",
  });

  let body: ErrorBody | T | null = null;
  try {
    body = res.status === 204 ? null : await res.json();
  } catch {
    body = null;
  }

  if (res.status === 401) {
    toastBus.emit("Your session has expired. Please sign in again.");
    unauthorizedHandler?.();
    throw new ApiError(401, "Unauthorized");
  }

  if (!res.ok) {
    const errBody = (body ?? { error: `Request failed (${res.status})` }) as ErrorBody;
    if (res.status >= 500) {
      toastBus.emit("Something went wrong on our end. Please try again.");
    } else if (res.status === 403) {
      toastBus.emit(errBody.error ?? "You are not allowed to do that.");
    }
    throw new ApiError(res.status, errBody.error ?? "Request failed", errBody.issues);
  }

  return (body ?? null) as T;
}

export const apiClient = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, data: unknown) =>
    request<T>(path, { method: "POST", body: JSON.stringify(data) }),
  patch: <T>(path: string, data: unknown) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(data) }),
  del: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};