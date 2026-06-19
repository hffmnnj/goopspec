import { describe, it, expect, afterEach, beforeEach } from "bun:test";
import { OMP_DETECTION_ENV, PI_RUNTIME_ENV } from "../../core/constants.js";
import { detectRuntime, isOmp, useBuiltinWebSearch, useBuiltinTask } from "./index.js";

describe("runtime detection", () => {
  let savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    savedEnv = {
      [OMP_DETECTION_ENV]: process.env[OMP_DETECTION_ENV],
      [PI_RUNTIME_ENV]: process.env[PI_RUNTIME_ENV],
    };
    // Clean slate
    delete process.env[OMP_DETECTION_ENV];
    delete process.env[PI_RUNTIME_ENV];
  });

  afterEach(() => {
    // Restore
    for (const [key, val] of Object.entries(savedEnv)) {
      if (val === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = val;
      }
    }
  });

  it("defaults to base pi when no env vars set", () => {
    const info = detectRuntime();
    expect(info.runtime).toBe("pi");
    expect(info.hasBuiltinTask).toBe(false);
    expect(info.hasBuiltinWebSearch).toBe(false);
    expect(info.hasBuiltinMemory).toBe(false);
    expect(info.version).toBeNull();
  });

  it("detects omp via OMP_VERSION env var", () => {
    process.env[OMP_DETECTION_ENV] = "16.0.10";
    const info = detectRuntime();
    expect(info.runtime).toBe("omp");
    expect(info.hasBuiltinTask).toBe(true);
    expect(info.hasBuiltinWebSearch).toBe(true);
    expect(info.hasBuiltinMemory).toBe(true);
    expect(info.version).toBe("16.0.10");
  });

  it("detects omp via PI_RUNTIME=omp env var", () => {
    process.env[PI_RUNTIME_ENV] = "omp";
    const info = detectRuntime();
    expect(info.runtime).toBe("omp");
    expect(info.hasBuiltinTask).toBe(true);
    expect(info.version).toBeNull();
  });

  it("prefers OMP_VERSION over PI_RUNTIME for version", () => {
    process.env[OMP_DETECTION_ENV] = "16.1.0";
    process.env[PI_RUNTIME_ENV] = "omp";
    const info = detectRuntime();
    expect(info.runtime).toBe("omp");
    expect(info.version).toBe("16.1.0");
  });

  it("ignores PI_RUNTIME when set to non-omp value", () => {
    process.env[PI_RUNTIME_ENV] = "pi";
    const info = detectRuntime();
    expect(info.runtime).toBe("pi");
    expect(info.hasBuiltinTask).toBe(false);
  });

  it("isOmp returns false for base pi", () => {
    expect(isOmp()).toBe(false);
  });

  it("isOmp returns true for omp", () => {
    process.env[OMP_DETECTION_ENV] = "16.0.0";
    expect(isOmp()).toBe(true);
  });

  it("useBuiltinWebSearch returns false for base pi", () => {
    expect(useBuiltinWebSearch()).toBe(false);
  });

  it("useBuiltinWebSearch returns true for omp", () => {
    process.env[OMP_DETECTION_ENV] = "16.0.0";
    expect(useBuiltinWebSearch()).toBe(true);
  });

  it("useBuiltinTask returns false for base pi", () => {
    expect(useBuiltinTask()).toBe(false);
  });

  it("useBuiltinTask returns true for omp", () => {
    process.env[OMP_DETECTION_ENV] = "16.0.0";
    expect(useBuiltinTask()).toBe(true);
  });
});
