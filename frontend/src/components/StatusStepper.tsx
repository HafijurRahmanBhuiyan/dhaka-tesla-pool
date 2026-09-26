"use client";

import type { RideStatus } from "@/lib/types";
import { statusLabel } from "./StatusBadge";

const STEPS: RideStatus[] = [
  "REQUESTED",
  "MATCHED",
  "DRIVER_ARRIVED",
  "STARTED",
  "COMPLETED",
];

type StepState = "done" | "active" | "upcoming";

interface StatusStepperProps {
  status: RideStatus;
}

function stepStateFor(index: number, currentIndex: number): StepState {
  if (index < currentIndex) return "done";
  if (index === currentIndex) return "active";
  return "upcoming";
}

function Circle({ state, display }: { state: StepState; display: number }) {
  return (
    <span
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-sm font-semibold ${
        state === "done"
          ? "border-zinc-900 bg-zinc-900 text-white dark:border-white dark:bg-white dark:text-zinc-900"
          : state === "active"
            ? "border-zinc-900 bg-white text-zinc-900 ring-4 ring-zinc-900/10 dark:border-white dark:bg-zinc-900 dark:text-white dark:ring-white/10"
            : "border-zinc-300 text-zinc-400 dark:border-zinc-700 dark:text-zinc-500"
      }`}
      aria-hidden="true"
    >
      {state === "done" ? (
        <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
          <path
            fillRule="evenodd"
            d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
            clipRule="evenodd"
          />
        </svg>
      ) : (
        display
      )}
    </span>
  );
}

export function StatusStepper({ status }: StatusStepperProps) {
  if (status === "CANCELLED") {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
        <svg className="h-5 w-5 shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path
            fillRule="evenodd"
            d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 6a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 6zm0 9a1 1 0 100-2 1 1 0 000 2z"
            clipRule="evenodd"
          />
        </svg>
        This ride was cancelled.
      </div>
    );
  }

  const currentIndex = STEPS.indexOf(status);

  return (
    <>
      {/* Horizontal layout: tablet and up */}
      <ol className="hidden items-center gap-0 md:flex">
        {STEPS.map((step, index) => {
          const state = stepStateFor(index, currentIndex);
          return (
            <li key={step} className={`flex items-center ${index > 0 ? "flex-1" : ""}`}>
              {index > 0 && (
                <div
                  className={`mx-2 h-0.5 flex-1 rounded ${
                    state === "done" || state === "active"
                      ? "bg-zinc-900 dark:bg-white"
                      : "bg-zinc-200 dark:bg-zinc-700"
                  }`}
                />
              )}
              <div className="flex flex-col items-center gap-1.5">
                <Circle state={state} display={index + 1} />
                <span
                  className={`text-xs font-medium ${
                    state === "active" || state === "done"
                      ? "text-zinc-900 dark:text-zinc-100"
                      : "text-zinc-400 dark:text-zinc-600"
                  }`}
                >
                  {statusLabel(step)}
                </span>
              </div>
            </li>
          );
        })}
      </ol>

      {/* Vertical timeline: mobile */}
      <ol className="md:hidden">
        {STEPS.map((step, index) => {
          const state = stepStateFor(index, currentIndex);
          const isLast = index === STEPS.length - 1;
          const nextState =
            index + 1 < STEPS.length ? stepStateFor(index + 1, currentIndex) : "upcoming";
          return (
            <li key={step} className="flex">
              <div className="flex flex-col items-center self-stretch">
                <Circle state={state} display={index + 1} />
                {!isLast && (
                  <span
                    className={`mt-2 w-0.5 flex-1 self-stretch rounded ${
                      nextState === "done" || nextState === "active"
                        ? "bg-zinc-900 dark:bg-white"
                        : "bg-zinc-200 dark:bg-zinc-700"
                    }`}
                  />
                )}
              </div>
              <span
                className={`ml-3 pb-6 pt-1.5 text-sm font-medium ${
                  state === "active" || state === "done"
                    ? "text-zinc-900 dark:text-zinc-100"
                    : "text-zinc-400 dark:text-zinc-600"
                }`}
              >
                {statusLabel(step)}
                {state === "active" && (
                  <span className="ml-2 inline-flex rounded-full bg-zinc-900 px-2 py-0.5 text-[10px] font-semibold text-white dark:bg-white dark:text-zinc-900">
                    Current
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ol>
    </>
  );
}