/**
 * Platform Detection Utilities
 * Detects OS, architecture, runtime environment, WSL status, and service manager
 * @module features/setup/platform
 */

import { readFileSync, existsSync } from "node:fs";

/** Available system service managers */
export type ServiceManager = "systemd" | "launchd" | "scm" | "none";

/**
 * Platform information for native extension installation and service management
 */
export interface PlatformInfo {
  /** Operating system: linux, darwin (macOS), or win32 (Windows) */
  os: "linux" | "darwin" | "win32";
  /** CPU architecture: x64 (Intel/AMD) or arm64 (Apple Silicon/ARM) */
  arch: "x64" | "arm64";
  /** JavaScript runtime: bun or node */
  runtime: "bun" | "node";
  /** Package suffix for platform-specific packages (e.g., "linux-x64") */
  packageSuffix: string;
  /** Human-readable platform description */
  description: string;
  /** Whether running inside Windows Subsystem for Linux */
  isWSL: boolean;
  /** Detected system service manager */
  serviceManager: ServiceManager;
}

/**
 * Supported platform combinations for sqlite-vec
 */
export const SUPPORTED_PLATFORMS = [
  "linux-x64",
  "linux-arm64",
  "darwin-x64",
  "darwin-arm64",
  "windows-x64",
] as const;

export type SupportedPlatform = (typeof SUPPORTED_PLATFORMS)[number];

/**
 * Detect whether the current environment is Windows Subsystem for Linux.
 * Reads /proc/version and checks for "microsoft" or "WSL" (case-insensitive).
 * Returns false on non-Linux platforms or if /proc/version cannot be read.
 */
export function isWSL(): boolean {
  if (process.platform !== "linux") {
    return false;
  }
  try {
    const version = readFileSync("/proc/version", "utf-8");
    return /microsoft|wsl/i.test(version);
  } catch {
    return false;
  }
}

/**
 * Detect the available system service manager for the current platform.
 * - macOS: always "launchd"
 * - Windows: always "scm"
 * - Linux/WSL: "systemd" if systemd is running, otherwise "none"
 */
export function detectServiceManager(): ServiceManager {
  const platform = process.platform;

  if (platform === "darwin") {
    return "launchd";
  }

  if (platform === "win32") {
    return "scm";
  }

  if (platform === "linux") {
    // Check for systemd by looking for its runtime socket
    try {
      if (existsSync("/run/systemd/system") || existsSync("/run/systemd/private")) {
        return "systemd";
      }
    } catch {
      // Filesystem check failed — fall through to "none"
    }
    return "none";
  }

  return "none";
}

/**
 * Check whether the Bun runtime is available, which is required to run the daemon.
 * Returns true if running under Bun or if the `bun` binary is on PATH.
 */
export function canRunDaemon(): boolean {
  // Fast path: already running in Bun
  if (typeof Bun !== "undefined") {
    return true;
  }

  // Fallback: check if bun binary exists on PATH
  try {
    const { execSync } = require("node:child_process");
    execSync("bun --version", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Detect current platform information
 */
export function detectPlatform(): PlatformInfo {
  const os = process.platform as PlatformInfo["os"];
  const arch = process.arch === "arm64" ? "arm64" : "x64";
  const runtime = typeof Bun !== "undefined" ? "bun" : "node";
  
  // Windows uses "win32" internally but packages use "windows"
  const osForPackage = os === "win32" ? "windows" : os;
  const packageSuffix = `${osForPackage}-${arch}`;
  
  const osNames: Record<string, string> = {
    linux: "Linux",
    darwin: "macOS",
    win32: "Windows",
  };
  
  const archNames: Record<string, string> = {
    x64: "x64 (Intel/AMD)",
    arm64: "ARM64 (Apple Silicon/ARM)",
  };
  
  const description = `${osNames[os] ?? os} ${archNames[arch] ?? arch}`;
  
  return {
    os,
    arch,
    runtime,
    packageSuffix,
    description,
    isWSL: isWSL(),
    serviceManager: detectServiceManager(),
  };
}

/**
 * Check if the current platform is supported for native extensions
 */
export function isPlatformSupported(platform: PlatformInfo): boolean {
  const suffix = platform.packageSuffix;
  return SUPPORTED_PLATFORMS.includes(suffix as SupportedPlatform);
}

/**
 * Get the sqlite-vec package name for a given platform
 */
export function getSqliteVecPackage(platform: PlatformInfo): string {
  // sqlite-vec uses platform-specific packages: sqlite-vec-{os}-{arch}
  return `sqlite-vec-${platform.packageSuffix}`;
}

/**
 * Get the ONNX runtime package name for a given platform
 * Note: onnxruntime-node works across platforms
 */
export function getOnnxRuntimePackage(_platform: PlatformInfo): string {
  // ONNX runtime uses a single package that includes platform-specific binaries
  return "onnxruntime-node";
}

/**
 * Get all required packages for local embeddings
 */
export function getEmbeddingPackages(platform: PlatformInfo): string[] {
  return [
    getOnnxRuntimePackage(platform),
    "@huggingface/transformers",
  ];
}

/**
 * Get all optional native extension packages for a platform
 */
export function getAllOptionalPackages(platform: PlatformInfo): {
  vectorSearch: string[];
  localEmbeddings: string[];
} {
  return {
    vectorSearch: [getSqliteVecPackage(platform)],
    localEmbeddings: getEmbeddingPackages(platform),
  };
}

/**
 * Format platform info for display
 */
export function formatPlatformInfo(platform: PlatformInfo): string {
  const lines = [
    `OS: ${platform.description}`,
    `Architecture: ${platform.arch}`,
    `Runtime: ${platform.runtime}`,
    `Package suffix: ${platform.packageSuffix}`,
  ];
  
  if (!isPlatformSupported(platform)) {
    lines.push("");
    lines.push("WARNING: This platform may not be fully supported for native extensions.");
  }
  
  return lines.join("\n");
}
