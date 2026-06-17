/**
 * Platform Confirmation Flow
 * Shows detected platform and asks user to confirm before installing
 * @module features/setup/platform-confirm
 */

import type { PlatformInfo } from "./platform.js";
import { getSqliteVecPackage, getOnnxRuntimePackage } from "./platform.js";
import type { AllDependencies } from "./dependencies.js";

export interface PlatformConfirmResult {
  confirmed: boolean;
  platform: PlatformInfo;
  packagesToInstall: string[];
}

/**
 * Get list of packages that need to be installed for selected features
 */
export function getPackagesToInstall(
  platform: PlatformInfo,
  deps: AllDependencies,
  features: string[]
): string[] {
  const packages: string[] = [];
  
  if (features.includes("vector-search") && !deps.sqliteVec.available) {
    packages.push(getSqliteVecPackage(platform));
  }
  
  if (features.includes("local-embeddings")) {
    if (!deps.onnxRuntime.available) {
      packages.push(getOnnxRuntimePackage(platform));
    }
    if (!deps.transformers.available) {
      packages.push("@huggingface/transformers");
    }
  }
  
  return packages;
}

/**
 * Format platform confirmation message
 */
export function formatPlatformConfirmation(
  platform: PlatformInfo,
  packagesToInstall: string[]
): string {
  const lines: string[] = [];
  
  lines.push("## Detected Platform");
  lines.push(`  OS: ${platform.description}`);
  lines.push(`  Architecture: ${platform.arch}`);
  lines.push(`  Runtime: ${platform.runtime}`);
  lines.push(`  Package suffix: ${platform.packageSuffix}`);
  lines.push("");
  
  if (packagesToInstall.length === 0) {
    lines.push("All selected features are already available.");
    lines.push("No packages need to be installed.");
  } else {
    lines.push("## Packages to Install");
    packagesToInstall.forEach(p => lines.push(`  - ${p}`));
    lines.push("");
    lines.push("These packages will be installed globally.");
  }
  
  return lines.join("\n");
}

/**
 * Create confirmation result without installing
 * Used when all features are already available
 */
export function createNoInstallResult(platform: PlatformInfo): PlatformConfirmResult {
  return {
    confirmed: true,
    platform,
    packagesToInstall: [],
  };
}

/**
 * Create confirmation result for quick mode
 * Auto-confirms without user interaction
 */
export function createQuickModeResult(
  platform: PlatformInfo,
  deps: AllDependencies,
  features: string[]
): PlatformConfirmResult {
  const packagesToInstall = getPackagesToInstall(platform, deps, features);
  
  return {
    confirmed: true,
    platform,
    packagesToInstall,
  };
}

/**
 * Create cancelled result
 */
export function createCancelledResult(platform: PlatformInfo): PlatformConfirmResult {
  return {
    confirmed: false,
    platform,
    packagesToInstall: [],
  };
}

/**
 * Validate platform is supported for selected features
 */
export function validatePlatformForFeatures(
  platform: PlatformInfo,
  features: string[]
): { valid: boolean; warnings: string[] } {
  const warnings: string[] = [];
  
  // Check for known unsupported combinations
  if (features.includes("vector-search")) {
    const supportedVec = ["linux-x64", "linux-arm64", "darwin-x64", "darwin-arm64", "windows-x64"];
    if (!supportedVec.includes(platform.packageSuffix)) {
      warnings.push(`sqlite-vec may not be available for ${platform.packageSuffix}`);
    }
  }
  
  if (features.includes("local-embeddings")) {
    // ONNX runtime has broad support, but some edge cases
    if (platform.packageSuffix === "linux-arm64") {
      warnings.push("ONNX Runtime on Linux ARM64 may have limited support");
    }
  }
  
  return {
    valid: warnings.length === 0,
    warnings,
  };
}

/**
 * Format platform validation warnings
 */
export function formatPlatformWarnings(warnings: string[]): string {
  if (warnings.length === 0) return "";
  
  const lines = ["## Platform Warnings", ""];
  warnings.forEach(w => lines.push(`- ${w}`));
  lines.push("");
  lines.push("Installation will proceed, but some features may not work.");
  
  return lines.join("\n");
}
