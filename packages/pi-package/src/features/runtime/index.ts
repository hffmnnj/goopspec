import type { PiRuntime } from "../../core/types.js";
import { OMP_DETECTION_ENV, PI_RUNTIME_ENV } from "../../core/constants.js";

/** Detection result with feature flags */
export type RuntimeInfo = {
  runtime: PiRuntime;
  hasBuiltinTask: boolean; // omp has a built-in `task` tool
  hasBuiltinWebSearch: boolean; // omp has a built-in `web_search` tool
  hasBuiltinMemory: boolean; // omp has hindsight/mnemopi memory
  version: string | null;
};

/**
 * Detect whether we're running on base Pi or oh-my-pi (omp).
 *
 * Detection strategy (in order):
 * 1. `OMP_VERSION` environment variable (set by omp)
 * 2. `PI_RUNTIME=omp` environment variable (explicit override)
 * 3. Default: base Pi
 */
export function detectRuntime(): RuntimeInfo {
  const ompVersion = process.env[OMP_DETECTION_ENV];
  const piRuntime = process.env[PI_RUNTIME_ENV];

  if (ompVersion || piRuntime === "omp") {
    return {
      runtime: "omp",
      hasBuiltinTask: true,
      hasBuiltinWebSearch: true,
      hasBuiltinMemory: true,
      version: ompVersion ?? null,
    };
  }

  return {
    runtime: "pi",
    hasBuiltinTask: false,
    hasBuiltinWebSearch: false,
    hasBuiltinMemory: false,
    version: null,
  };
}

/** Returns true if running on oh-my-pi */
export function isOmp(): boolean {
  return detectRuntime().runtime === "omp";
}

/** Feature flag: should we use our own web search or delegate to omp? */
export function useBuiltinWebSearch(): boolean {
  return detectRuntime().hasBuiltinWebSearch;
}

/** Feature flag: should we use our own task tool or delegate to omp? */
export function useBuiltinTask(): boolean {
  return detectRuntime().hasBuiltinTask;
}
